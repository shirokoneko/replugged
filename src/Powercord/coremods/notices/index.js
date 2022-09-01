const { loadStyle } = require('../util');

const { resolve, join } = require('path');
const { existsSync } = require('fs');
const { unlink } = require('fs').promises;
const { React, getModule, getModuleByDisplayName, constants: { Routes }, i18n: { Messages } } = require('powercord/webpack');
const { forceUpdateElement, getOwnerInstance, waitFor, findInReactTree } = require('powercord/util');
const { inject, uninject } = require('powercord/injector');
const { GUILD_ID, DISCORD_INVITE } = require('powercord/constants');

const ToastContainer = require('./components/ToastContainer');
const AnnouncementContainer = require('./components/AnnouncementContainer');

async function _patchAnnouncements () {
  const { base } = await getModule([ 'base', 'container' ]);
  const instance = getOwnerInstance(await waitFor(`.${base.split(' ')[0]}`));
  inject('pc-notices-announcements', instance.props.children[0], 'type', (_, res) => {
    const { children } = findInReactTree(res, ({ className }) => className === base);
    children.unshift(React.createElement(AnnouncementContainer));
    return res;
  });

  powercord.api.notices.once('announcementAdded', () => {
    forceUpdateElement(`.${base}`);
  });
}

async function _patchToasts () {
  const { app } = await getModule([ 'app', 'layers' ]);
  const Shakeable = await getModuleByDisplayName('Shakeable');
  inject('pc-notices-toast', Shakeable.prototype, 'render', (_, res) => {
    if (!res.props.children.find(child => child.type && child.type.name === 'ToastContainer')) {
      res.props.children.push(React.createElement(ToastContainer));
    }
    return res;
  });
  forceUpdateElement(`.${app}`);
}

module.exports = async () => {
  loadStyle(join(__dirname, 'style.scss'));

  _patchAnnouncements();
  _patchToasts();

  const injectedFile = resolve(__dirname, '..', '..', '..', '__injected.txt');
  if (existsSync(injectedFile)) {
    const connection = await getModule([ 'isTryingToConnect', 'isConnected' ]);
    const connectedListener = async () => {
      if (!connection.isConnected()) {
        return;
      }
      connection.removeChangeListener(connectedListener);

      // Run once discord is started:
      /* Check if user is in the replugged guild. Only show new
           user banner if they aren't already in the discord server. */
      const guildStore = await getModule([ 'getGuilds' ]);
      if (!guildStore.getGuilds()[GUILD_ID]) {
        _welcomeNewUser();
      }
    };

    if (connection.isConnected()) {
      connectedListener();
    } else {
      connection.addChangeListener(connectedListener);
    }

    unlink(injectedFile);
  }

  return () => {
    uninject('pc-notices-announcements');
    uninject('pc-notices-toast');
  };
};

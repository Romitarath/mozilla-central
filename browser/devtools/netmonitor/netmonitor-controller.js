/* -*- Mode: javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

const NET_STRINGS_URI = "chrome://browser/locale/devtools/netmonitor.properties";
const LISTENERS = [ "NetworkActivity" ];
const NET_PREFS = { "NetworkMonitor.saveRequestAndResponseBodies": true };

// The panel's window global is an EventEmitter firing the following events:
const EVENTS = {
  // When the monitored target begins and finishes navigating.
  TARGET_WILL_NAVIGATE: "NetMonitor:TargetWillNavigate",
  TARGET_DID_NAVIGATE: "NetMonitor:TargetNavigate",

  // When a network event is received.
  // See https://developer.mozilla.org/docs/Tools/Web_Console/remoting for
  // more information about what each packet is supposed to deliver.
  NETWORK_EVENT: "NetMonitor:NetworkEvent",

  // When request headers begin and finish receiving.
  UPDATING_REQUEST_HEADERS: "NetMonitor:NetworkEventUpdating:RequestHeaders",
  RECEIVED_REQUEST_HEADERS: "NetMonitor:NetworkEventUpdated:RequestHeaders",

  // When request cookies begin and finish receiving.
  UPDATING_REQUEST_COOKIES: "NetMonitor:NetworkEventUpdating:RequestCookies",
  RECEIVED_REQUEST_COOKIES: "NetMonitor:NetworkEventUpdated:RequestCookies",

  // When request post data begins and finishes receiving.
  UPDATING_REQUEST_POST_DATA: "NetMonitor:NetworkEventUpdating:RequestPostData",
  RECEIVED_REQUEST_POST_DATA: "NetMonitor:NetworkEventUpdated:RequestPostData",

  // When response headers begin and finish receiving.
  UPDATING_RESPONSE_HEADERS: "NetMonitor:NetworkEventUpdating:ResponseHeaders",
  RECEIVED_RESPONSE_HEADERS: "NetMonitor:NetworkEventUpdated:ResponseHeaders",

  // When response cookies begin and finish receiving.
  UPDATING_RESPONSE_COOKIES: "NetMonitor:NetworkEventUpdating:ResponseCookies",
  RECEIVED_RESPONSE_COOKIES: "NetMonitor:NetworkEventUpdated:ResponseCookies",

  // When event timings begin and finish receiving.
  UPDATING_EVENT_TIMINGS: "NetMonitor:NetworkEventUpdating:EventTimings",
  RECEIVED_EVENT_TIMINGS: "NetMonitor:NetworkEventUpdated:EventTimings",

  // When response content begins, updates and finishes receiving.
  STARTED_RECEIVING_RESPONSE: "NetMonitor:NetworkEventUpdating:ResponseStart",
  UPDATING_RESPONSE_CONTENT: "NetMonitor:NetworkEventUpdating:ResponseContent",
  RECEIVED_RESPONSE_CONTENT: "NetMonitor:NetworkEventUpdated:ResponseContent",

  // When the request post params are displayed in the UI.
  REQUEST_POST_PARAMS_DISPLAYED: "NetMonitor:RequestPostParamsAvailable",

  // When the response body is displayed in the UI.
  RESPONSE_BODY_DISPLAYED: "NetMonitor:ResponseBodyAvailable"
}

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
let promise = Cu.import("resource://gre/modules/commonjs/sdk/core/promise.js").Promise;
Cu.import("resource:///modules/devtools/sourceeditor/source-editor.jsm");
Cu.import("resource:///modules/devtools/shared/event-emitter.js");
Cu.import("resource:///modules/devtools/SideMenuWidget.jsm");
Cu.import("resource:///modules/devtools/VariablesView.jsm");
Cu.import("resource:///modules/devtools/ViewHelpers.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "PluralForm",
  "resource://gre/modules/PluralForm.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "devtools",
  "resource://gre/modules/devtools/Loader.jsm");

Object.defineProperty(this, "NetworkHelper", {
  get: function() {
    return devtools.require("devtools/toolkit/webconsole/network-helper");
  },
  configurable: true,
  enumerable: true
});

XPCOMUtils.defineLazyServiceGetter(this, "clipboardHelper",
  "@mozilla.org/widget/clipboardhelper;1", "nsIClipboardHelper");

/**
 * Object defining the network monitor controller components.
 */
let NetMonitorController = {
  /**
   * Initializes the view.
   *
   * @return object
   *         A promise that is resolved when the monitor finishes startup.
   */
  startupNetMonitor: function() {
    if (this._startup) {
      return this._startup;
    }

    NetMonitorView.initialize();

    // Startup is synchronous, for now.
    return this._startup = promise.resolve();
  },

  /**
   * Destroys the view and disconnects the monitor client from the server.
   *
   * @return object
   *         A promise that is resolved when the monitor finishes shutdown.
   */
  shutdownNetMonitor: function() {
    if (this._shutdown) {
      return this._shutdown;
    }

    NetMonitorView.destroy();
    this.TargetEventsHandler.disconnect();
    this.NetworkEventsHandler.disconnect();
    this.disconnect();

    // Shutdown is synchronous, for now.
    return this._shutdown = promise.resolve();
  },

  /**
   * Initiates remote or chrome network monitoring based on the current target,
   * wiring event handlers as necessary.
   *
   * @return object
   *         A promise that is resolved when the monitor finishes connecting.
   */
  connect: function() {
    if (this._connection) {
      return this._connection;
    }

    let deferred = promise.defer();
    this._connection = deferred.promise;

    let target = this._target;
    let { client, form } = target;
    if (target.chrome) {
      this._startChromeMonitoring(client, form.consoleActor, deferred.resolve);
    } else {
      this._startMonitoringTab(client, form, deferred.resolve);
    }

    return deferred.promise;
  },

  /**
   * Disconnects the debugger client and removes event handlers as necessary.
   */
  disconnect: function() {
    // When debugging local or a remote instance, the connection is closed by
    // the RemoteTarget.
    this._connection = null;
    this.client = null;
    this.tabClient = null;
    this.webConsoleClient = null;
  },

  /**
   * Sets up a monitoring session.
   *
   * @param DebuggerClient aClient
   *        The debugger client.
   * @param object aTabGrip
   *        The remote protocol grip of the tab.
   * @param function aCallback
   *        A function to invoke once the client attached to the console client.
   */
  _startMonitoringTab: function(aClient, aTabGrip, aCallback) {
    if (!aClient) {
      Cu.reportError("No client found!");
      return;
    }
    this.client = aClient;

    aClient.attachTab(aTabGrip.actor, (aResponse, aTabClient) => {
      if (!aTabClient) {
        Cu.reportError("No tab client found!");
        return;
      }
      this.tabClient = aTabClient;

      aClient.attachConsole(aTabGrip.consoleActor, LISTENERS, (aResponse, aWebConsoleClient) => {
        if (!aWebConsoleClient) {
          Cu.reportError("Couldn't attach to console: " + aResponse.error);
          return;
        }
        this.webConsoleClient = aWebConsoleClient;
        this.webConsoleClient.setPreferences(NET_PREFS, () => {
          this.TargetEventsHandler.connect();
          this.NetworkEventsHandler.connect();

          if (aCallback) {
            aCallback();
          }
        });
      });
    });
  },

  /**
   * Sets up a chrome monitoring session.
   *
   * @param DebuggerClient aClient
   *        The debugger client.
   * @param object aConsoleActor
   *        The remote protocol grip of the chrome debugger.
   * @param function aCallback
   *        A function to invoke once the client attached to the console client.
   */
  _startChromeMonitoring: function(aClient, aConsoleActor, aCallback) {
    if (!aClient) {
      Cu.reportError("No client found!");
      return;
    }
    this.client = aClient;

    aClient.attachConsole(aConsoleActor, LISTENERS, (aResponse, aWebConsoleClient) => {
      if (!aWebConsoleClient) {
        Cu.reportError("Couldn't attach to console: " + aResponse.error);
        return;
      }
      this.webConsoleClient = aWebConsoleClient;
      this.webConsoleClient.setPreferences(NET_PREFS, () => {
        this.TargetEventsHandler.connect();
        this.NetworkEventsHandler.connect();

        if (aCallback) {
          aCallback();
        }
      });
    });
  },

  _startup: null,
  _shutdown: null,
  _connection: null,
  client: null,
  tabClient: null,
  webConsoleClient: null
};

/**
 * Functions handling target-related lifetime events.
 */
function TargetEventsHandler() {
  this._onTabNavigated = this._onTabNavigated.bind(this);
  this._onTabDetached = this._onTabDetached.bind(this);
}

TargetEventsHandler.prototype = {
  get target() NetMonitorController._target,
  get webConsoleClient() NetMonitorController.webConsoleClient,

  /**
   * Listen for events emitted by the current tab target.
   */
  connect: function() {
    dumpn("TargetEventsHandler is connecting...");
    this.target.on("close", this._onTabDetached);
    this.target.on("navigate", this._onTabNavigated);
    this.target.on("will-navigate", this._onTabNavigated);
  },

  /**
   * Remove events emitted by the current tab target.
   */
  disconnect: function() {
    if (!this.target) {
      return;
    }
    dumpn("TargetEventsHandler is disconnecting...");
    this.target.off("close", this._onTabDetached);
    this.target.off("navigate", this._onTabNavigated);
    this.target.off("will-navigate", this._onTabNavigated);
  },

  /**
   * Called for each location change in the monitored tab.
   *
   * @param string aType
   *        Packet type.
   * @param object aPacket
   *        Packet received from the server.
   */
  _onTabNavigated: function(aType, aPacket) {
    switch (aType) {
      case "will-navigate": {
        // Reset UI.
        NetMonitorView.RequestsMenu.reset();
        NetMonitorView.Sidebar.reset();
        NetMonitorView.NetworkDetails.reset();

        window.emit(EVENTS.TARGET_WILL_NAVIGATE);
        break;
      }
      case "navigate": {
        window.emit(EVENTS.TARGET_DID_NAVIGATE);
        break;
      }
    }
  },

  /**
   * Called when the monitored tab is closed.
   */
  _onTabDetached: function() {
    NetMonitorController.shutdownNetMonitor();
  }
};

/**
 * Functions handling target network events.
 */
function NetworkEventsHandler() {
  this._onNetworkEvent = this._onNetworkEvent.bind(this);
  this._onNetworkEventUpdate = this._onNetworkEventUpdate.bind(this);
  this._onRequestHeaders = this._onRequestHeaders.bind(this);
  this._onRequestCookies = this._onRequestCookies.bind(this);
  this._onRequestPostData = this._onRequestPostData.bind(this);
  this._onResponseHeaders = this._onResponseHeaders.bind(this);
  this._onResponseCookies = this._onResponseCookies.bind(this);
  this._onResponseContent = this._onResponseContent.bind(this);
  this._onEventTimings = this._onEventTimings.bind(this);
}

NetworkEventsHandler.prototype = {
  get client() NetMonitorController._target.client,
  get webConsoleClient() NetMonitorController.webConsoleClient,

  /**
   * Connect to the current target client.
   */
  connect: function() {
    dumpn("NetworkEventsHandler is connecting...");
    this.client.addListener("networkEvent", this._onNetworkEvent);
    this.client.addListener("networkEventUpdate", this._onNetworkEventUpdate);
  },

  /**
   * Disconnect from the client.
   */
  disconnect: function() {
    if (!this.client) {
      return;
    }
    dumpn("NetworkEventsHandler is disconnecting...");
    this.client.removeListener("networkEvent", this._onNetworkEvent);
    this.client.removeListener("networkEventUpdate", this._onNetworkEventUpdate);
  },

  /**
   * The "networkEvent" message type handler.
   *
   * @param string aType
   *        Message type.
   * @param object aPacket
   *        The message received from the server.
   */
  _onNetworkEvent: function(aType, aPacket) {
    let { actor, startedDateTime, method, url, isXHR } = aPacket.eventActor;
    NetMonitorView.RequestsMenu.addRequest(actor, startedDateTime, method, url, isXHR);

    window.emit(EVENTS.NETWORK_EVENT);
  },

  /**
   * The "networkEventUpdate" message type handler.
   *
   * @param string aType
   *        Message type.
   * @param object aPacket
   *        The message received from the server.
   */
  _onNetworkEventUpdate: function(aType, aPacket) {
    let actor = aPacket.from;

    switch (aPacket.updateType) {
      case "requestHeaders":
        this.webConsoleClient.getRequestHeaders(actor, this._onRequestHeaders);
        window.emit(EVENTS.UPDATING_REQUEST_HEADERS);
        break;
      case "requestCookies":
        this.webConsoleClient.getRequestCookies(actor, this._onRequestCookies);
        window.emit(EVENTS.UPDATING_REQUEST_COOKIES);
        break;
      case "requestPostData":
        this.webConsoleClient.getRequestPostData(actor, this._onRequestPostData);
        window.emit(EVENTS.UPDATING_REQUEST_POST_DATA);
        break;
      case "responseHeaders":
        this.webConsoleClient.getResponseHeaders(actor, this._onResponseHeaders);
        window.emit(EVENTS.UPDATING_RESPONSE_HEADERS);
        break;
      case "responseCookies":
        this.webConsoleClient.getResponseCookies(actor, this._onResponseCookies);
        window.emit(EVENTS.UPDATING_RESPONSE_COOKIES);
        break;
      case "responseStart":
        NetMonitorView.RequestsMenu.updateRequest(aPacket.from, {
          httpVersion: aPacket.response.httpVersion,
          status: aPacket.response.status,
          statusText: aPacket.response.statusText,
          headersSize: aPacket.response.headersSize
        });
        window.emit(EVENTS.STARTED_RECEIVING_RESPONSE);
        break;
      case "responseContent":
        NetMonitorView.RequestsMenu.updateRequest(aPacket.from, {
          contentSize: aPacket.contentSize,
          mimeType: aPacket.mimeType
        });
        this.webConsoleClient.getResponseContent(actor, this._onResponseContent);
        window.emit(EVENTS.UPDATING_RESPONSE_CONTENT);
        break;
      case "eventTimings":
        NetMonitorView.RequestsMenu.updateRequest(aPacket.from, {
          totalTime: aPacket.totalTime
        });
        this.webConsoleClient.getEventTimings(actor, this._onEventTimings);
        window.emit(EVENTS.UPDATING_EVENT_TIMINGS);
        break;
    }
  },

  /**
   * Handles additional information received for a "requestHeaders" packet.
   *
   * @param object aResponse
   *        The message received from the server.
   */
  _onRequestHeaders: function(aResponse) {
    NetMonitorView.RequestsMenu.updateRequest(aResponse.from, {
      requestHeaders: aResponse
    });
    window.emit(EVENTS.RECEIVED_REQUEST_HEADERS);
  },

  /**
   * Handles additional information received for a "requestCookies" packet.
   *
   * @param object aResponse
   *        The message received from the server.
   */
  _onRequestCookies: function(aResponse) {
    NetMonitorView.RequestsMenu.updateRequest(aResponse.from, {
      requestCookies: aResponse
    });
    window.emit(EVENTS.RECEIVED_REQUEST_COOKIES);
  },

  /**
   * Handles additional information received for a "requestPostData" packet.
   *
   * @param object aResponse
   *        The message received from the server.
   */
  _onRequestPostData: function(aResponse) {
    NetMonitorView.RequestsMenu.updateRequest(aResponse.from, {
      requestPostData: aResponse
    });
    window.emit(EVENTS.RECEIVED_REQUEST_POST_DATA);
  },

  /**
   * Handles additional information received for a "responseHeaders" packet.
   *
   * @param object aResponse
   *        The message received from the server.
   */
  _onResponseHeaders: function(aResponse) {
    NetMonitorView.RequestsMenu.updateRequest(aResponse.from, {
      responseHeaders: aResponse
    });
    window.emit(EVENTS.RECEIVED_RESPONSE_HEADERS);
  },

  /**
   * Handles additional information received for a "responseCookies" packet.
   *
   * @param object aResponse
   *        The message received from the server.
   */
  _onResponseCookies: function(aResponse) {
    NetMonitorView.RequestsMenu.updateRequest(aResponse.from, {
      responseCookies: aResponse
    });
    window.emit(EVENTS.RECEIVED_RESPONSE_COOKIES);
  },

  /**
   * Handles additional information received for a "responseContent" packet.
   *
   * @param object aResponse
   *        The message received from the server.
   */
  _onResponseContent: function(aResponse) {
    NetMonitorView.RequestsMenu.updateRequest(aResponse.from, {
      responseContent: aResponse
    });
    window.emit(EVENTS.RECEIVED_RESPONSE_CONTENT);
  },

  /**
   * Handles additional information received for a "eventTimings" packet.
   *
   * @param object aResponse
   *        The message received from the server.
   */
  _onEventTimings: function(aResponse) {
    NetMonitorView.RequestsMenu.updateRequest(aResponse.from, {
      eventTimings: aResponse
    });
    window.emit(EVENTS.RECEIVED_EVENT_TIMINGS);
  },

  /**
   * Fetches the full text of a LongString.
   *
   * @param object | string aStringGrip
   *        The long string grip containing the corresponding actor.
   *        If you pass in a plain string (by accident or because you're lazy),
   *        then a promise of the same string is simply returned.
   * @return object Promise
   *         A promise that is resolved when the full string contents
   *         are available, or rejected if something goes wrong.
   */
  getString: function(aStringGrip) {
    // Make sure this is a long string.
    if (typeof aStringGrip != "object" || aStringGrip.type != "longString") {
      return promise.resolve(aStringGrip); // Go home string, you're drunk.
    }
    // Fetch the long string only once.
    if (aStringGrip._fullText) {
      return aStringGrip._fullText.promise;
    }

    let deferred = aStringGrip._fullText = promise.defer();
    let { actor, initial, length } = aStringGrip;
    let longStringClient = this.webConsoleClient.longString(aStringGrip);

    longStringClient.substring(initial.length, length, aResponse => {
      if (aResponse.error) {
        Cu.reportError(aResponse.error + ": " + aResponse.message);
        deferred.reject(aResponse);
        return;
      }
      deferred.resolve(initial + aResponse.substring);
    });

    return deferred.promise;
  }
};

/**
 * Localization convenience methods.
 */
let L10N = new ViewHelpers.L10N(NET_STRINGS_URI);

/**
 * Shortcuts for accessing various network monitor preferences.
 */
let Prefs = new ViewHelpers.Prefs("devtools.netmonitor", {
  networkDetailsWidth: ["Int", "panes-network-details-width"],
  networkDetailsHeight: ["Int", "panes-network-details-height"]
});

/**
 * Returns true if this is document is in RTL mode.
 * @return boolean
 */
XPCOMUtils.defineLazyGetter(window, "isRTL", function() {
  return window.getComputedStyle(document.documentElement, null).direction == "rtl";
});

/**
 * Convenient way of emitting events from the panel window.
 */
EventEmitter.decorate(this);

/**
 * Preliminary setup for the NetMonitorController object.
 */
NetMonitorController.TargetEventsHandler = new TargetEventsHandler();
NetMonitorController.NetworkEventsHandler = new NetworkEventsHandler();

/**
 * Export some properties to the global scope for easier access.
 */
Object.defineProperties(window, {
  "gNetwork": {
    get: function() NetMonitorController.NetworkEventsHandler
  }
});

/**
 * Helper method for debugging.
 * @param string
 */
function dumpn(str) {
  if (wantLogging) {
    dump("NET-FRONTEND: " + str + "\n");
  }
}

let wantLogging = Services.prefs.getBoolPref("devtools.debugger.log");

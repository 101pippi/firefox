/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var nightly = {

variables: {
  _appInfo: null,
  _buildInfo: null,
  get appInfo() {
    if (!this._appInfo) {
      this._appInfo = Components.classes["@mozilla.org/xre/app-info;1"]
                                .getService(Components.interfaces.nsIXULAppInfo)
                                .QueryInterface(Components.interfaces.nsIXULRuntime);
    }
    return this._appInfo;
  },
  get buildInfo() {
    if (!this._buildInfo) {
      var { IniFile } = Components.utils.import("resource://nightly/IniFile.jsm", {});
      var application = new IniFile("application.ini");
      var platform = new IniFile("platform.ini");

      this._buildInfo = {};
      this._buildInfo.changeSet = application.getString("App","SourceStamp");
      this._buildInfo.repository = application.getString("App","SourceRepository");

      this._buildInfo.platformChangeSet = platform.getString("Build","SourceStamp");
      this._buildInfo.platformRepository = platform.getString("Build","SourceRepository");
    }
    return this._buildInfo;
  },

  get appid() this.appInfo.ID,
  get vendor() {
    // Fix for vendor not being set in Mozilla Thunderbird
    return this.appInfo.name == "Thunderbird" && this.appInfo.vendor == "" ? "Mozilla" : this.appInfo.vendor;
  },
  get name() this.appInfo.name,
  get version() this.appInfo.version,
  get appbuildid() this.appInfo.appBuildID,
  get platformbuildid() this.appInfo.platformBuildID,
  get platformversion() this.appInfo.platformVersion,
  get geckobuildid() this.appInfo.platformBuildID,
  get geckoversion() this.appInfo.platformVersion,
  get changeset() this.buildInfo.changeSet,
  get platformchangeset() this.buildInfo.platformChangeSet,
  get repository() this.buildInfo.repository,
  get platformrepository() this.buildInfo.platformRepository,
  brandname: null,
  get useragent() navigator.userAgent,
  get locale() {
    var registry = Components.classes["@mozilla.org/chrome/chrome-registry;1"]
                             .getService(Components.interfaces.nsIXULChromeRegistry);
    return registry.getSelectedLocale("global");
  },
  get os() this.appInfo.OS,
  get processor() this.appInfo.XPCOMABI.split("-")[0],
  get compiler() this.appInfo.XPCOMABI.split(/-(.*)$/)[1],
  get defaulttitle() { return nightlyApp.defaultTitle; },
  get tabscount() { return nightlyApp.tabsCount; },
  get tabtitle() { return nightlyApp.tabTitle; },
  profile: null,
  toolkit: "cairo",
  flags: ""
},

templates: {
},

getString: function(name, format) {
  if (format) {
    return document.getElementById("nightlyBundle").getFormattedString(name, format);
  }
  else {
    return document.getElementById("nightlyBundle").getString(name);
  }
},

preferences: null,

/**
 *  A helper function for nsIPromptService.confirmEx().
 *  Popping up an alert("Hello!") is as simple as nightly.showConfirmEx({text: "Hello!"});
 *
 *  @see https://developer.mozilla.org/docs/XPCOM_Interface_Reference/nsIPromptService#confirmEx%28%29
 *
 *  @param {Object} aOptions
 *  @param {String} aOptions.text
 *  @param {Number} aOptions.buttonFlags
 *  @param {String} aOptions.button0Title
 *  @param {String} aOptions.button1Title
 *  @param {String} aOptions.button2Title
 *
 *  @returns {Number} Index of the button pressed (0..2)
 */
showConfirmEx: function (aOptions) {
  var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                                .getService(Components.interfaces.nsIPromptService);

  var options = aOptions || {};
  var buttonFlags = options.buttonFlags || promptService.BUTTON_TITLE_OK * promptService.BUTTON_POS_0;

  return promptService.confirmEx(null, "Nightly Tester Tools", options.text,
    buttonFlags, options.button0Title, options.button1Title, options.button2Title,
    null, {});
},

showAlert: function(id, args) {
  var text = nightly.getString(id, args);
  nightly.showConfirmEx({text: text});
},

init: function() {
  window.removeEventListener("load", nightly.init, false);
  var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                        .getService(Components.interfaces.nsIPrefService);
  nightly.preferences = prefs.getBranch("nightly.")
                             .QueryInterface(Components.interfaces.nsIPrefBranchInternal);
  nightly.preferences.addObserver("", nightly, false);

  var profd = Components.classes["@mozilla.org/file/directory_service;1"]
                        .getService(Components.interfaces.nsIProperties)
                        .get("ProfD", Components.interfaces.nsILocalFile);
  var profservice = Components.classes["@mozilla.org/toolkit/profile-service;1"]
                              .getService(Components.interfaces.nsIToolkitProfileService);
  var profiles = profservice.profiles;
  while (profiles.hasMoreElements()) {
    var profile = profiles.getNext().QueryInterface(Components.interfaces.nsIToolkitProfile);
    if (profile.rootDir.path == profd.path) {
      nightly.variables.profile = profile.name;
      break;
    }
  }

  if (!nightly.variables.profile)
    nightly.variables.profile = profd.leafName;

  nightlyApp.init();
  nightly.prefChange("idtitle");

  var changeset = nightly.getChangeset();
  var currChangeset = nightly.preferences.getCharPref("currChangeset");
  if (!currChangeset || changeset != currChangeset) {
    // keep track of previous nightly's changeset for pushlog
    nightly.preferences.setCharPref("prevChangeset", currChangeset);
    nightly.preferences.setCharPref("currChangeset", changeset);
  }
},

unload: function(pref) {
  window.removeEventListener("unload",nightly.unload,false);
  nightly.preferences.removeObserver("",nightly);
},

prefChange: function(pref) {
  if ((pref == "idtitle") || (pref == "templates.title"))
    nightly.updateTitlebar();
},

updateTitlebar: function() {
  if (nightly.preferences.getBoolPref("idtitle")) {
    var title = nightly.getTemplate("title");
    nightlyApp.setCustomTitle(nightly.generateText(title));
  }
  else {
    nightlyApp.setStandardTitle();
  }
},

observe: function(prefBranch, subject, pref) {
  nightly.prefChange(pref);
},

getStoredItem: function(type, name) {
  name = name.toLowerCase();
  var value = null;
  try {
    return nightly.preferences.getCharPref(type+"."+name);
  }
  catch (e) {}

  if (nightly[type].hasOwnProperty(name)) {
    value = nightly[type][name];
    if (value === undefined || value === null) {
      value = nightly.getString("nightly.variables.nullvalue");
    }
    return value;
  }

  return undefined;
},

getVariable: function(name) {
  return nightly.getStoredItem("variables",name);
},

getTemplate: function(name) {
  return nightly.getStoredItem("templates",name);
},

generateText: function(template) {
  var start = 0;
  var pos = template.indexOf("${",start);
  while (pos >= 0) {
    if ((pos == 0) || (template.charAt(pos - 1) != "$")) {
      var endpos = template.indexOf("}", pos + 2);
      if (endpos >= 0) {
        var varname = template.substring(pos+2,endpos);
        var varvalue = nightly.getVariable(varname);
        if (varvalue !== null && varvalue !== undefined) {
          template = template.substring(0, pos) + varvalue +
                     template.substring(endpos + 1, template.length);
          start = pos + varvalue.length;
        }
        else {
          start = pos + 2;
        }
      }
      else {
        start = pos + 2;
      }
    }
    else {
      start = pos + 2;
    }
    pos = template.indexOf("${", start);
  }
  return template;
},

copyText: function(text) {
  var clipboard = Components.classes["@mozilla.org/widget/clipboardhelper;1"].
                                         getService(Components.interfaces.nsIClipboardHelper);
  clipboard.copyString(text);
},

copyTemplate: function(template) {
  nightly.copyText(nightly.generateText(nightly.getTemplate(template)));
},

pastebin: function (content, onLoadCallback, onErrorCallback) {
  if (content === null || content === "" || content === undefined) {
    onError();
    return;
  }
  var postdata;
  var request = new XMLHttpRequest();
  request.open("POST", "https://pastebin.mozilla.org/", true);

  request.onreadystatechange = function() {
    if (request.readyState == 4 ) {
      if (request.status === 200) {
        nightlyApp.openURL(request.channel.URI.spec);
      }
      if (typeof onLoadCallback === "function") {
        onLoadCallback();
      }
    }
  };

  function onError() {
    if (typeof onErrorCallback === "function") {
      onErrorCallback();
    }
  }

  request.onabort = onError;
  request.onerror = onError;

  postdata = new FormData();
  postdata.append("code2", content);
  postdata.append("expiry", "m");
  postdata.append("format", "text");
  postdata.append("parent_pid", "");
  postdata.append("paste", "Send");
  postdata.append("poster", "anonymous");

  request.send(postdata);
},

parseHTML: function(url, callback) {
  var frame = document.getElementById("sample-frame");
  if (!frame)
    frame = document.createElement("iframe");

  frame.setAttribute("id", "sample-frame");
  frame.setAttribute("name", "sample-frame");
  frame.setAttribute("type", "content");
  frame.setAttribute("collapsed", "true");
  document.lastChild.appendChild(frame);

  frame.addEventListener("load", function (event) {
    var doc = event.originalTarget;
    if (doc.location.href == "about:blank" || doc.defaultView.frameElement)
      return;

    setTimeout(function () { // give enough time for js to populate page
      callback(doc);
      frame.parentNode.removeChild(frame);
    }, 800);
  }, true);
  frame.contentDocument.location.href = url;
},

pastebinAboutSupport: function (aEvent) {
  var node = aEvent.originalTarget;
  node.setAttribute("loading", "true");
  node.disabled = true;

  nightly.parseHTML("about:support", function(doc) {
    var contents = doc.getElementById("contents");
    var text = nightlyPPrint.createTextForElement(contents);
    function enableMenuItem() {
      node.removeAttribute("loading");
      node.disabled = false;
    }
    nightly.pastebin(text, enableMenuItem, enableMenuItem);
  });
},

menuPopup: function(event, menupopup) {
  if (menupopup == event.target) {
    var attext = false;

    var element = document.commandDispatcher.focusedElement;
    if (element) {
      var type = element.localName.toLowerCase();
      attext = ((type == "input") || (type == "textarea"))
    }

    var node=menupopup.firstChild;
    while (node) {
      if (node.id.indexOf("-insert") != -1)
        node.hidden = !attext;
      if (node.id.indexOf("-copy") != -1)
        node.hidden = attext;
      if (node.id == 'nightly-aboutsupport')
        node.hidden = !("@mozilla.org/network/protocol/about;1?what=support" in Components.classes);
      if (node.id == 'nightly-pushlog-lasttocurrent')
        node.disabled = !nightly.preferences.getCharPref("prevChangeset");
      if (node.id == 'nightly-crashme')
        node.hidden = !ctypes.libraryName;
      if (node.id == 'nightly-compatibility')
        node.setAttribute("checked", nightly.preferences.getBoolPref("disableCheckCompatibility"));
      node=node.nextSibling;
    }
  }
},

insertTemplate: function(template) {
  var element = document.commandDispatcher.focusedElement;
  if (element) {
    var type = element.localName.toLowerCase();
    if ((type == "input") || (type == "textarea")) {
      var text = nightly.generateText(nightly.getTemplate(template));
      var newpos = element.selectionStart+text.length;
      var value = element.value;
      element.value = value.substring(0, element.selectionStart) + text +
                      value.substring(element.selectionEnd);
      element.selectionStart = newpos;
      element.selectionEnd = newpos;
      return;
    }
  }

  // no usable element was found
  const psButtonFlags = Components.interfaces.nsIPromptService;
  var promptOptions = {};
  promptOptions.text = nightly.getString("nightly.notextbox.message") + "\n" +
    nightly.getString("nightly.notextbox.clipboardInstead.message");
  promptOptions.buttonFlags = psButtonFlags.BUTTON_POS_0 * psButtonFlags.BUTTON_TITLE_IS_STRING +
    psButtonFlags.BUTTON_POS_1 * psButtonFlags.BUTTON_TITLE_CANCEL;

  promptOptions.button0Title = nightly.getString("nightly.copyButton.message");

  var buttonPressed = nightly.showConfirmEx(promptOptions);
  if (buttonPressed == 0) {
    nightly.copyTemplate(template);
  }
},

insensitiveSort: function(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a < b)
    return -1
  if (a > b)
    return 1
  // a must be equal to b
  return 0
},

getExtensionList: function(callback) {
  try {
    Components.utils.import("resource://gre/modules/AddonManager.jsm");

    AddonManager.getAddonsByTypes(['extension'], function(addons) {
      if (!addons.length)
        nightly.showAlert("nightly.noextensions.message", []);

      var strings = addons.map(function(addon) {
        return addon.name + " " + addon.version
          + (addon.userDisabled || addon.appDisabled ? " [DISABLED]" : "");
      });
      strings.sort(nightly.insensitiveSort);
      callback(strings);
    });
  } catch(e) {
    // old extension manager API - take out after Firefox 3.6 support dropped
    var em = Components.classes["@mozilla.org/extensions/manager;1"]
                       .getService(Components.interfaces.nsIExtensionManager);

    var items = em.getItemList(Components.interfaces.nsIUpdateItem.TYPE_EXTENSION, {});

    if (items.length == 0) {
      nightly.showAlert("nightly.noextensions.message", []);
      return null;
    }

    var rdfS = Components.classes["@mozilla.org/rdf/rdf-service;1"]
                         .getService(Components.interfaces.nsIRDFService);
    var ds = em.datasource;
    var disabledResource = rdfS.GetResource("http://www.mozilla.org/2004/em-rdf#disabled");
    var isDisabledResource = rdfS.GetResource("http://www.mozilla.org/2004/em-rdf#isDisabled");
    var text = [];
    for (var i = 0; i < items.length; i++) {
      text[i] = items[i].name + " " + items[i].version;
      var source = rdfS.GetResource("urn:mozilla:item:" + items[i].id);
      var disabled = ds.GetTarget(source, disabledResource, true);
      if (!disabled)
        disabled = ds.GetTarget(source, isDisabledResource, true);
      try {
        disabled=disabled.QueryInterface(Components.interfaces.nsIRDFLiteral);
        if (disabled.Value=="true")
          text[i]+=" [DISABLED]";
      }
      catch (e) { }
    }
    text.sort(nightly.insensitiveSort);
    callback(text);
  }
},

insertExtensions: function() {
  var element = document.commandDispatcher.focusedElement;
  if (element) {
    var type = element.localName.toLowerCase();
    if ((type == "input") || (type == "textarea")) {
      nightly.getExtensionList(function(text) {
        var newpos = element.selectionStart + text.length;
        var value = element.value;
        element.value = value.substring(0, element.selectionStart) + text.join(", ") +
                        value.substring(element.selectionEnd);
        element.selectionStart = newpos;
        element.selectionEnd = newpos;
      });
      return;
    }
  }
  nightly.showAlert("nightly.notextbox.message",[]);
},

copyExtensions: function() {
  nightly.getExtensionList(function(text) {
    if (text)
      nightly.copyText(text.join(", "));
  });
},

openProfileDir: function() {
  var stream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                         .createInstance(Components.interfaces.nsIFileInputStream);
  var directoryService = Components.classes["@mozilla.org/file/directory_service;1"]
                                   .getService(Components.interfaces.nsIProperties);

  var profile = directoryService.get("ProfD",Components.interfaces.nsILocalFile);
  try {
    profile.reveal();
  }
  catch (ex) {
    var uri = Components.classes["@mozilla.org/network/io-service;1"]
                        .getService(Components.interfaces.nsIIOService)
                        .newFileURI(profile);
    var protocolSvc = Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
                                .getService(Components.interfaces.nsIExternalProtocolService);
    protocolSvc.loadUrl(uri);
  }
},

alertType: function(type) {
  var directoryService = Components.classes["@mozilla.org/file/directory_service;1"]
                           .getService(Components.interfaces.nsIProperties);

  var dir = directoryService.get(type, Components.interfaces.nsIFile);
  window.alert(dir.path);
},

getScreenshot: function() {
  window.openDialog("chrome://nightly/content/screenshot/screenshot.xul", "_blank", "chrome,all,dialog=no");
},

openCustomize: function() {
  var wm = Components.classes['@mozilla.org/appshell/window-mediator;1']
                     .getService(Components.interfaces.nsIWindowMediator);

  var win = wm.getMostRecentWindow("NightlyTester:Customize");
  if (win) {
    win.focus();
    return;
  }

  var features;
  try {
    var prefservice = Components.classes["@mozilla.org/preferences-service;1"]
                                .getService(Components.interfaces.nsIPrefBranch);
    var instantApply = prefservice.getBoolPref("browser.preferences.instantApply");
    features = "chrome,titlebar,toolbar,centerscreen,resizable" + (instantApply ? ",dialog=no" : ",modal");
  }
  catch (e) {
    features = "chrome,titlebar,toolbar,centerscreen,resizable,modal";
  }
  openDialog("chrome://nightly/content/titlebar/customize.xul", "", features);
},

getAppIniString : function(section, key) {
  var directoryService = Components.classes["@mozilla.org/file/directory_service;1"].
                           getService(Components.interfaces.nsIProperties);
  var inifile = directoryService.get("GreD", Components.interfaces.nsIFile);
  inifile.append("application.ini");

  if (!inifile.exists()) {
    inifile = directoryService.get("CurProcD", Components.interfaces.nsIFile);
    inifile.append("application.ini");
  }

  var iniParser = Components.manager.getClassObjectByContractID(
                    "@mozilla.org/xpcom/ini-parser-factory;1",
                     Components.interfaces.nsIINIParserFactory)
                  .createINIParser(inifile);
  try {
    return iniParser.getString(section, key);
  } catch (e) {
    return undefined;
  }
},

getRepo: function() {
  return nightly.getVariable("repository");
},

getChangeset: function() {
  return nightly.getVariable("changeSet");
},

openPushlog: function(fromChange, toChange) {
  if (fromChange) {
    var pushlogUrl = nightly.getRepo() + "/pushloghtml?fromchange=" + fromChange;
    if (toChange)
      pushlogUrl += "&tochange=" + toChange;
    nightlyApp.openURL(pushlogUrl);
  }
},

openPushlogToCurrentBuild: function() {
  var prevChangeset = nightly.preferences.getCharPref("prevChangeset");
  var currChangeset = nightly.getChangeset();
  nightly.openPushlog(prevChangeset, currChangeset);
},

openPushlogSinceCurrentBuild: function() {
  var currChangeset = nightly.getChangeset();
  nightly.openPushlog(currChangeset);
},

toggleCompatibility: function() {
  var forceCompat = nightly.preferences.getBoolPref("disableCheckCompatibility");
  if (nightlyApp.openNotification) {
    var obs = Components.classes["@mozilla.org/observer-service;1"]
              .getService(Components.interfaces.nsIObserverService);
    var restartObserver = {
      observe: function (subject, topic, data) {
        obs.removeObserver(restartObserver, "_nttACS");
        var parsedData = JSON.parse(data);
        if (parsedData && parsedData.restart) {
          nightlyApp.openNotification("nightly-compatibility-restart",
            nightly.getString("nightly.restart.message"),
            nightly.getString("nightly.restart.label"),
            nightly.getString("nightly.restart.accesskey"),
            function() { nightly.restart(); });
        }
      }
    };
    obs.addObserver(restartObserver, "_nttACS", false);
  }
  nightly.preferences.setBoolPref("disableCheckCompatibility", !forceCompat);
},

restart: function()
{
  var acs = Components.classes["@mozilla.com/nightly/addoncompatibility;1"]
            .getService().wrappedJSObject;
  acs.restart();
},

}

try { // import ctypes for determining wether to show crashme menu item
  Components.utils.import("resource://gre/modules/ctypes.jsm");
}
catch(e) {}


// register addon pref listeners
try {
  Components.classes["@mozilla.com/nightly/addoncompatibility;1"].createInstance();
}
catch(e) {}


window.addEventListener("load", nightly.init, false);
window.addEventListener("unload", nightly.unload, false);

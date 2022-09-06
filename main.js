var websocket = null;
var pluginUUID = null;
var baseurl = "https://px1.tuyaus.com/homeassistant/";
var DestinationEnum = Object.freeze({ "HARDWARE_AND_SOFTWARE": 0, "HARDWARE_ONLY": 1, "SOFTWARE_ONLY": 2 });
var SwitchStateEnum = Object.freeze({ "OFF": 0, "ON": 1 });
var timer;

var localCredentials = {
    "username": "",
    "password": "",
    "access_token": "",
    "sl_refresh_token": "",
    "sl_expires_in": "",
    "logged_in": true,
};

var  local = {
    getUsername: function () {
        return localCredentials['username'];
    },
    getPassword: function () {
        return localCredentials['password'];
    },
    getAccessToken: function () {
        return localCredentials['access_token'];
    },
    getRefreshToken: function () {
        return localCredentials['sl_refresh_token'];
    },
    getTokenExpiricy: function () {
        return localCredentials['sl_expires_in'];
    },
    isLoggedIn: function () {
        return localCredentials['logged_in'];
    },

    setUsername: function (val) {
        localCredentials['username'] = val;
    },
    setPassword: function (val) {
        localCredentials['password'] = val;
    },
    setAccessToken: function (val) {
        localCredentials['access_token'] = val;
    },
    setRefreshToken: function (val) {
        localCredentials['sl_refresh_token'] = val;
    },
    setTokenExpiricy: function (val) {
        localCredentials['sl_expires_in'] = val;
    },
    setIsLoggedId: function (val) {
        localCredentials['logged_in'] = val;
    },


};

var counterAction = {

    type: "com.elgato.smartlife.action",

    onKeyDown: function (context, settings, coordinates, userDesiredState) {
        // Nothing to see here
    },

    onKeyUp: function (context, settings, coordinates, userDesiredState) {
        console.log(settings);

        // if not auth or session expired
        if ( this.isSessionExpired() ) {
            apiAction.Login(context, local.getUsername(), local.getPassword(), 1);
        }

        //if token expires in less than a day RefreshToken
        if (local.getTokenExpiricy() < Date.now()) {
            console.log("[onKeyUp] Session near to expire");
            apiAction.RefreshToken(context);
        }
        apiAction.AdjustDevice(context, settings.device_id, "turnOnOff", "value", (settings.state+1)%2);
    },

    onWillAppear: function (context, settings, coordinates) {
        console.log(`[onWillAppear] UUID=${context} settings: ${JSON.stringify(settings)}`);   
        apiAction.QueryDevice(context, settings.device_id, 1);
    },

    SetSettings: function (context, settings) {
        var json = {
            "event": "setSettings",
            "context": context,
            "payload": settings
        };
        websocket.send(JSON.stringify(json));
    },

    SetGlobalSettings: function (context, settings) {
        var json = {
            "event": "setGlobalSettings",
            "context": context,
            "payload": settings
        };
        websocket.send(JSON.stringify(json));
    },

    SetState: function (context, state) {
        var json = {
            "event": "setState",
            "context": context,
            "payload": {
                "state": state
            }
        };
        websocket.send(JSON.stringify(json));
    },

    UpdateLocalCredentials: function (context, settings) {
        console.log(`[UpdateLocalCredentials] UUID=${pluginUUID} Old LocalCredentials: ${JSON.stringify(localCredentials)}`);
        if (settings != null) {
            for (var key in settings) {
                if (localCredentials.hasOwnProperty(key)) {
                    localCredentials[key] = settings[key];
                }
            }
        }
        console.log(`[UpdateLocalCredentials] UUID=${pluginUUID} New LocalCredentials: ${JSON.stringify(localCredentials)}`);
    },

    isSessionExpired: function () {
        return Date.now() >= local.getTokenExpiricy();
    },


};

var apiAction = {
    Login: function (context, username, password, region) {
        var url = baseurl + "auth.do";

        if (region == '1') {
            url = baseurl.replace('eu', 'us') + "auth.do";
        } else if (region == '86') {
            url = baseurl.replace('eu', 'cn') + "auth.do";
        }

        var headers = {
            "Content-Type": "application/x-www-form-urlencoded"
        }

        var data = {
            "userName": username,
            "password": password,
            "countryCode": region,
            "bizType": "smart_life",
            "from": "tuya",
        }
        console.log(`Login Request: ${JSON.stringify(data)}`);
        $.ajax({
            url: url,
            type: "POST",
            headers: headers,
            data: data,
            dataType: "json",
            async: false,
            success: function (json) {
                if (json["responseStatus"] == "error") {
                    console.log(`Login errorMsg: ${json.errorMsg}`);
                } else {
                    local.setIsLoggedId(!!json.access_token);
                    local.setAccessToken(json.access_token || local.getAccessToken());
                    local.setRefreshToken(json.refresh_token || local.getRefreshToken());
                    if (!!json.expires_in) {
                        local.setTokenExpiricy(json.expires_in + Date.now());
                    }
                    counterAction.SetGlobalSettings(context, localCredentials);
                }
            }
        });
    },

    // This Endpoint has a cooldown of 180 seg
    QueryDevice: function (context, device, value) {
        var url = baseurl + "skill";

        var headers = {
            "Content-Type": "application/json"
        }
        var data = {
            "header": {
                "name": "QueryDevice",
                "namespace": "query",
                "payloadVersion": 1
            },
            "payload": {
                "accessToken": local.getAccessToken(),
                "devId": device,
                "value": 1
            }
        }
        console.log(`[QueryDevice]: ${JSON.stringify(data)}`);
        $.ajax({
            url: url,
            type: "POST",
            headers: headers,
            data: JSON.stringify(data),
            dataType: "json",
            async: false,
            success: function (json) {
                if (json.header != undefined && json.header.code == "SUCCESS") {
                    console.log(json);
                    setTimeout(apiAction.QueryDevice(context, device, 1), 181000);
                } else {
                    console.log(`QueryDevice error: ${JSON.stringify(json)}`);
                    if (header.code == "FrequentlyInvoke") {
                        setTimeout(apiAction.QueryDevice(context, device, value + 1), 181000 * value);
                    }

                }

            }
        });
    },

    AdjustDevice: function (context, device, action, value_name, new_state) {

        var url = baseurl + "skill";

        var headers = {
            "Content-Type": "application/json"
        }
        var data = {
            "header": {
                "name": action,
                "namespace": "control",
                "payloadVersion": 1
            },
            "payload": {
                "accessToken": local.getAccessToken(),
                "devId": device,
                "value": new_state
            }
        }
        console.log(data);
        $.ajax({
            url: url,
            type: "POST",
            headers: headers,
            data: JSON.stringify(data),
            dataType: "json",
            async: false,
            success: function (json) {
                if (json.header != undefined && json.header.code == "SUCCESS") {
                    counterAction.SetSettings(context, { "device_id": device, "state": new_state });
                    counterAction.SetState(context, new_state);
                    console.log(json);
                    to_return = json
                } else {
                    console.log(`AdjustDevice error: ${JSON.stringify(json)}`);
                }
            }
        });
    },

    RefreshToken: function (context) {
        url = baseurl + "access.do";
        params = { "grant_type": "refresh_token", "refresh_token": local.getRefreshToken(), "rand": Math.random() }
        console.log(`[RefreshToken] Request params: ${JSON.stringify(params)}`);
        $.ajax({
            url: url,
            type: "GET",
            data: params,
            dataType: "json",
            async: false,
            success: function (json) {
                console.log(`[RefreshToken] Response: ${json}`);
                local.setAccessToken(json["access_token"] || local.getAccessToken());
                local.setRefreshToken(json["refresh_token"] || local.getRefreshToken())
                if (!!json.expires_in) {
                    local.setTokenExpiricy(json.expires_in * 1000 + Date.now());
                }
                counterAction.SetSettings(context, localCredentials);
            }
        });
    }
};

function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo) {
    pluginUUID = inPluginUUID

    // Open the web socket
    websocket = new WebSocket("ws://127.0.0.1:" + inPort);

    function registerPlugin(inPluginUUID) {
        var json = {
            "event": inRegisterEvent,
            "uuid": inPluginUUID
        };

        websocket.send(JSON.stringify(json));
    };

    websocket.onopen = function () {
        // WebSocket is connected, send message
        registerPlugin(pluginUUID);
        json = {
            "event": "getSettings",
            "context": pluginUUID,
        };

        websocket.send(JSON.stringify(json));
        json = {
            "event": "getGlobalSettings",
            "context": pluginUUID,
        };
        websocket.send(JSON.stringify(json));
    };

    websocket.onmessage = function (evt) {
        // Received message from Stream Deck
        var jsonObj = JSON.parse(evt.data);
        var event = jsonObj['event'];
        var action = jsonObj['action'];
        var context = jsonObj['context'];

        if (event == "keyDown") {
            var jsonPayload = jsonObj['payload'];
            var settings = jsonPayload['settings'];
            var coordinates = jsonPayload['coordinates'];
            var userDesiredState = jsonPayload['userDesiredState'];
            counterAction.onKeyDown(context, settings, coordinates, userDesiredState);
        }
        else if (event == "keyUp") {
            var jsonPayload = jsonObj['payload'];
            var settings = jsonPayload['settings'];
            var coordinates = jsonPayload['coordinates'];
            var userDesiredState = jsonPayload['userDesiredState'];
            counterAction.onKeyUp(context, settings, coordinates, userDesiredState);
        }
        else if (event == "willAppear") {
            var jsonPayload = jsonObj['payload'];
            var settings = jsonPayload['settings'];
            var coordinates = jsonPayload['coordinates'];
            counterAction.onWillAppear(context, settings, coordinates);
        }
        else if (event == "didReceiveGlobalSettings") {
            var jsonPayload = jsonObj['payload'];
            var settings = jsonPayload['settings'];
            counterAction.UpdateLocalCredentials(context,settings)
        }
        else if (event == "didReceiveSettings") {
            var jsonPayload = jsonObj['payload'];
            var settings = jsonPayload['settings'];
            console.log(`didReceiveSettings UUID=${pluginUUID} json:${jsonPayload}`)
            //we dont sava state locally anymore, oh no!
        }
    };

    websocket.onclose = function () {
        // Websocket is closed
    };
};

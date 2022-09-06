const baseurl = "https://px1.tuyaus.com/homeassistant/";

let websocket = null,
    uuid = null,
    actionInfo = {};

let globalSettings = {};
let settings = {};

let apiAction = {

    Login: function (username, password, region) {
        const data = {
            "userName": username,
            "password": password,
            "countryCode": region,
            "bizType": "smart_life",
            "from": "tuya",
        };
        let formBody = [];
        for (let property in data) {
            let encodedKey = encodeURIComponent(property);
            let encodedValue = encodeURIComponent(data[property]);
            formBody.push(encodedKey + "=" + encodedValue);
        }
        formBody = formBody.join("&");

        fetch(baseurl + "auth.do", {
            method: 'POST',
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formBody,
        }).then((response) => {
            return response.json();
        }).then((data) => {
            if (!!data.access_token) {
                globalSettings['access_token'] = data.access_token;
                globalSettings['refresh_token'] = data.refresh_token;
                globalSettings['expires_in'] = Date.now() + data.expires_in;
                updateGlobalSetting();
            } else {
                console.log(`error: ${JSON.stringify(data)}`);
            }

        }).catch((error) => {
            console.error('Error:', error);
        });
    },

    FetchDevices: function (access_token) {
        const data = {
            "header": {
                "name": "Discovery",
                "namespace": "discovery",
                "payloadVersion": 1
            },
            "payload": {
                "accessToken": access_token
            }
        };
        fetch(baseurl + "skill", {
            method: 'POST',
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        }).then(
            res => res.json()
        ).then((res) => {
            if (res.header?.code === "SUCCESS") {
                globalSettings["devices"] = parseDevices(res.payload.devices);
                updateGlobalSetting();
            } else {
                console.log(`code: ${res.code} msg:${res.msg}`);
            }

        }).catch((error) => {
            console.error('Error:', error);
        });
    }
};

function connectElgatoStreamDeckSocket(inPort, inPropertyInspectorUUID, inRegisterEvent, inInfo, inActionInfo) {

    uuid = inPropertyInspectorUUID;
    actionInfo = JSON.parse(inActionInfo);

    websocket = new WebSocket('ws://localhost:' + inPort);

    websocket.onopen = function () {
        // WebSocket is connected, register the Property Inspector
        let json = {
            "event": inRegisterEvent,
            "uuid": inPropertyInspectorUUID
        };
        websocket.send(JSON.stringify(json));

        json = {
            "event": "getSettings",
            "context": uuid
        };
        websocket.send(JSON.stringify(json));

        json = {
            "event": "getGlobalSettings",
            "context": uuid
        };
        websocket.send(JSON.stringify(json));
    };

    websocket.onmessage = function (evt) {
        // Received message from Stream Deck
        const jsonObj = JSON.parse(evt.data);
        console.log(`[onmessage] jsonObj: ${JSON.stringify(jsonObj)}`);

        if (jsonObj.event === 'didReceiveGlobalSettings') {
            const payload = jsonObj.payload?.settings;

            document.getElementById('username').value = payload.username;
            document.getElementById('password').value = payload.password;

            if (document.getElementById('username').value === "undefined") {
                document.getElementById('username').value = "";
            }

            if (document.getElementById('password').value === "undefined") {
                document.getElementById('password').value = "";
            }
            globalSettings = payload;
        }
        else if (jsonObj.event === 'didReceiveSettings') {
            const payload = jsonObj.payload?.settings;
            console.log('didReceiveSettings: ' + JSON.stringify(payload.device_id));

            document.getElementById('device_id').value = payload.device_id;

            if (document.getElementById('device_id').value === "undefined") {
                document.getElementById('device_id').value = "";
            }
            settings = payload;
        }
    };

}

function fetchDevices() {
    let target = document.getElementById('device');

    apiAction.FetchDevices(globalSettings.access_token);
    target.innerHTML = generateOptions(globalSettings.devices);
}


function updateSettings() {
    if (websocket && (websocket.readyState === 1)) {
        let payload = {};
        //payload['device_id'] = document.getElementById('device_id').value;
        var select = document.getElementById("device")
        payload = JSON.parse(select.item(select.selectedIndex)?.value);

        const json = {
            "event": "setSettings",
            "context": uuid,
            "payload": payload
        };
        websocket.send(JSON.stringify(json));
        console.log(`[updateSetting] data: ${JSON.stringify(json)}`);
    }
}
        
function updateGlobalSetting() {
    if (websocket && (websocket.readyState === 1)) {
        globalSettings['password'] = document.getElementById('password').value;
        globalSettings['username'] = document.getElementById('username').value;

        const json = {
            "event": "setGlobalSettings",
            "context": uuid,
            "payload": globalSettings
        };
        websocket.send(JSON.stringify(json));
        console.log(`[updateGlobalSetting] data: ${JSON.stringify(json)}`);
    }
}

function parseDevices(devices) {
    let devicesOnly = [];
    for (let i = 0; i < devices.length; i++) {
        let device = devices[i];
        let auxDev = {};
        if (device?.dev_type === "switch" || device?.dev_type === "light") {
            auxDev['name'] = device.name;
            auxDev['device_id'] = device.id;
            auxDev['state'] = device.data.state;
            devicesOnly.push(auxDev);
        } 
    }
    console.log(JSON.stringify(devicesOnly));
    return devicesOnly;
}

function generateOptions(devices) {
    let htmlOptions = "";
    for (let i = 0; i < devices.length; i++) {
        let dev = devices[i];
        htmlOptions += `<option value='${JSON.stringify(dev)}'>${dev.name}</option>`
    }
    return htmlOptions;
}


const exp = require('express')
const xsenv = require('@sap/xsenv')
const axios = require('axios')
const hdbext = require('@sap/hdbext')

const app = exp()

let hanasrv = xsenv.getServices({ "hana": { tag: 'hana' } })
let msgsrv = xsenv.getServices({ "enterprise-messaging": { tag: 'enterprise-messaging' } })

// message push function
let eventpush = async (baseuri, accesstoken, body) => {
    await axios.post(baseuri, body, {
        headers: {
            'content-type': 'application/json',
            'Authorization': `Bearer ${accesstoken}`    // this access token is the JWT token needed to access endpoint
        }
    }).then(response => {
        console.log('Queue API success')
        console.log(err)
    }).catch(err => {
        console.log('Error in Queue API')
        console.log(err)
    })
};

// get Access token function 
// let clientid = "sb-clone-xbem-service-broker-f9483ca0acfe49c9b778dee53f960e26-clone!b53029|xbem-service-broker-!b732";
// let clientsecret = "3a3aee73-819c-42cd-9d94-c11269e33ecf$llysaER6UIRo1DnZ7Z9nozHxLiQ6RQnlnP6JjKFrOjk=";
// let tokenurl = "https://f7361de1trial.authentication.us10.hana.ondemand.com/oauth/token?grant_type=client_credentials&response_type=token";

let getaccesstoken = async (clientid, clientsecret, tokenurl) => {
    // const token = Buffer.from(`${clientid}:${clientsecret}`, 'utf-8').toString('base64')
    try {
        const response = await axios.post(tokenurl, {}, {
            header: {
                'Content-Type': 'multipart/form-data'
            },
            auth: {
                username: clientid,
                password: clientsecret
            }
        });
        // return new Promise((resolve, reject) => {
        //     resolve(response.data.access_token);
        // })
        return response.data.access_token;
    } catch (err) {
        console.log(err)
    }
}

// getaccesstoken(clientid, clientsecret, tokenurl).then(token => { console.log(token) });

let eventmsgpush = async (baseuri, body, clientid, clientsecret, tokenurl) => {
    const accesstoken = await getaccesstoken(clientid, clientsecret, tokenurl);
    eventpush(baseuri, accesstoken, body);
}

// push messages to Queue
app.post('/push', (req, res) => {
    let aMessaging = msgsrv['enterprise-messaging'].messaging
    let aHttp = aMessaging.filter(oMessaging => oMessaging.protocol == "httprest");
    let sTokenUrl = aHttp[0].oa2.tokenendpoint + '?grant_type=client_credentials&response_type=token';
    let sBaseUri = aHttp[0].uri + '/messagingrest/v1/queues/hanaqueue/messages';
    const sUsername = aHttp[0].oa2.clientid;
    const sPassword = aHttp[0].oa2.clientsecret;
    eventmsgpush(sBaseUri, req.body, sUsername, sPassword, sTokenUrl);
    res.send('Data push done');
})


//function to update HANA
let updatehana = (data, req) => {
    let element = data;
    req.db.exec('INSERT INTO "DBADMIN"."EMRECEIVE" VALUES(?,?,?)', [element.ID, element.DATA, element.Comments],
        (err) => {
            if (err) {
                console.log(err);

            }
        });
};

//function for pull request
let eventpull = async (baseuri, accesstoken, req) => {
    await axios.post(baseuri, {}, {
        headers: {
            'content-type': 'application/json',
            'Authorization': `Bearer ${accesstoken}`,
            'x-qos': 1
        }
    }).then(response => {
        console.log('Queue API success webhook');
        console.log(response);
        //update HANA
        updatehana(response.data, req);
    }).catch(err => {
        console.log('err in Queue API webhook');
        console.log(err);
    });
};

//function for webhook
let eventmsgpull = async (baseuri, req, clientid, clientsecret, tokenurl) => {
    const accesstoken = await getaccesstoken(clientid, clientsecret, tokenurl);
    eventpull(baseuri, accesstoken, req);
}

//get data from EMSEND
app.get('/emsend', (req, res) => {
    req.db.exec('SELECT * FROM "DBADMIN"."EMRECEIVE"', (err, rows) => {
        if (err) {
            res.type('text/plain').status(500).send(err);
        };
        res.status(200).json(rows);
    });
});

////Webhook subscription from QUEUE
app.post('/pull', (req, res) => {
    let element = req.body;
    req.db.exec('INSERT INTO "DBADMIN"."EMRECEIVE" VALUES(?,?,?)', [element.ID, element.DATA, element.Comments], (err) => {
        if (err) {
            console.log(err);
        }
    })

    res.send('Data upload successful');
})

//send sample response
app.get('/', (req, res) => {
    res.send('API is working');
});

const port = process.env.PORT || 2000;
app.listen(port);

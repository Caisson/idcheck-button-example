"use strict";
const express = require("express");
const request = require("request-promise-native");
const app = express();
const port = 8080;

app.use(express.static('public'))
app.set('view engine', 'ejs');
const CAISSON_API_SERVER = "https://api-noam.caisson.dev";

// Our fake database - a simple map of user_id -> user object
let users = new Map();

const getUser = id => {
  let user = users.get(id);
  if (!user) {
    user = { id };
    users.set(id, user);
  }

  return user;
};

const setUser = user => {
  if (!user.id) {
    throw new Error("Invalid user");
  }

  users.set(user.id, user);
};

// Handle Caisson check exchange token. Check exchange tokens must be exchanged for
// a permanent check_id. We'll use the check_id to query the ID Check results.
const exchangeToken = async (req, res) => {
  // Our web page must send us the user ID and the Caisson exchange token.
  if (!req.body || !req.body.user_id || !req.body.caisson_exchange_token) {
    res.status(400).send("invalid input");
    return;
  }

  const user_id = req.body.user_id;
  const caisson_exchange_token = req.body.caisson_exchange_token;

  try {
    // Hit the Caisson token exchange API
    const caissonXchgRes = await request.post(
      `${CAISSON_API_SERVER}/v1/idcheck/exchangetoken`,
      {
        headers: {
          // Note the authorization header value is prefixed by 'Caisson '
          Authorization: `Caisson ${process.env.CAISSON_SECRET_API_KEY}`
        },
        body: {
          // Caisson token exchange API expects the token in JSON format { check_exchange_token: ... }
          check_exchange_token: caisson_exchange_token
        },
        json: true
      }
    );

    // Caisson APIs return an error field in the JSON response only in case of errors. Presence of 'error' means
    // the request failed.
    if (caissonXchgRes.error) {
      console.error(
        `Error '${caissonXchgRes.error}' exchanging Caisson Token: "${caissonXchgRes.error_message}"`
      );
      res.status(500).send("Error exchanging token");
      return;
    }

    // All's good. We exchanged the token for a check_id. Now we store the Caisson check_id on the user's record
    let user = getUser(user_id);
    user.caissonCheckID = caissonXchgRes.check_id;
    setUser(user);

    // Echo back the user ID for which we just exchanged the token.
    res.end(JSON.stringify({ user_id }));
  } catch (err) {
    if (err.statusCode) {
      // There was an HTTP error. In our example, we'll relay the HTTP error to the user registration web page
      console.error("Error: " + err.message);
      res.send("HTTP error during token exchange", err.statusCode);
      return;
    }

    // Some other unexpected error occurred.
    console.error("Error: " + err.message);
    res.status(500).send(`Error exchanging token: ${err}`);
  }

  return;
};

// Get an ID Check result
const getIDCheckResult = async (req, res) => {
  if (!req.query || !req.query.user_id) {
    res.status(400).send("invalid input");
    return;
  }

  const user_id = req.query.user_id;
  const user = getUser(user_id);

  // If we previously fetched the ID Check data from Caisson, there's no need to fetch it again.
  // Send back the fields we need. We don't want to send back the entire object that contains
  // sensitive personal data.
  if (user.idCheckResult) {
    res.end(
      JSON.stringify({
        user_id,
        id_check_data: {
          first_name: user.idCheckResult.info.first_name,
          last_name: user.idCheckResult.info.last_name
        }
      })
    );
    return;
  }

  // We should have exchanged the Check exchanged token for a permanent check ID.
  // It's an error if we haven't.
  if (!user.caissonCheckID) {
    res.status(400).send("Missing Caisson check ID");
    return;
  }

  try {
    // Use Caisson's GET ID Check API to fetch ID Check results
    const caissonResultRes = await request.get(
      `${CAISSON_API_SERVER}/v1/idcheck`,
      {
        headers: {
          // Note the authorization header value is prefixed by 'Caisson '
          Authorization: `Caisson ${process.env.CAISSON_SECRET_API_KEY}`,
          // For security reasons we send the Caisson check ID in a header rathe than a query param.
          "X-Caisson-CheckID": user.caissonCheckID
        },
        json: true
      }
    );

    if (caissonResultRes.error == "NOT_VERIFIED") {
      // The user hasn't verified their ID yet.
      console.error(`User '${user_id}' has not yet verified their ID`);
      res.status(500).send(`User '${user_id}' has not yet verified their ID`);
      return;
    } else if (caissonResultRes.error) {
      // Some other error occurred.
      console.error(
        `Error '${caissonResultRes.error}' fetching Caisson ID Check result: "${caissonResultRes.error_message}"`
      );
      res.status(500).send("Error fetching ID Check result");
      return;
    }

    // All's good. Now we store the Caisson ID Check result on the user's record
    user.idCheckResult = { ...caissonResultRes };
    setUser(user);

    // Send the fields we need back to the web page. We don't want to send back the entire
    // object that contains sensitive personal data.
    res.end(
      JSON.stringify({
        user_id,
        id_check_data: {
          first_name: user.idCheckResult.info.first_name,
          last_name: user.idCheckResult.info.last_name
        }
      })
    );
  } catch (err) {
    if (err.statusCode) {
      // There was an HTTP error. In our example, we'll relay the HTTP error to the user registration web page
      console.error("Error: " + err.message);
      res.send("HTTP error during fetching ID Check result", err.statusCode);
      return;
    }

    // Some other unexpected error occurred.
    console.error("Error: " + err.message);
    res.status(500).send(`Error fetching ID Check: ${err}`);
  }
};


const startServer = async () => {
  if (!process.env.CAISSON_SECRET_API_KEY) {
    console.error("Missing CAISSON_SECRET_API_KEY environment variable");
    return;
  }

  if (!process.env.CAISSON_PUBLIC_API_KEY) {
    console.error("Missing CAISSON_PUBLIC_API_KEY environment variable");
    return;
  }

  app.post("/exchangetoken", express.json(), exchangeToken);
  app.get("/idcheckresult", getIDCheckResult);
  app.get("/", function(req, res) {
    res.render('index',{
      CAISSON_PUBLIC_API_KEY: process.env.CAISSON_PUBLIC_API_KEY,
      USER_ID: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);return v.toString(16);})
    });
  });

  app.listen(port, () => console.log(`Listening on port ${port}`));
};

startServer();


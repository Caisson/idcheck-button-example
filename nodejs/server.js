const express = require("express");
const https = require("https");
const app = express();
const port = 8080;
const CAISSON_SECRET_API_KEY =
  "prod_sec_OnbVibKk0gnbC-Z4bYLylYgtWBFV5FuwFtgh-utirdk";
const CAISSON_API_SERVER = "https://api-noam.caisson.dev";
const CAISSON_AUTH_HEADER = `Caisson ${CAISSON_SECRET_API_KEY}`;

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

  // Use Caisson's exchangetoken API to exchange it for a permanent check_id
  const caissonXchgReq = https.request(
    `${CAISSON_API_SERVER}/v1/idcheck/exchangetoken`,
    {
      method: "POST",
      headers: {
        Authorization: CAISSON_AUTH_HEADER
      }
    },
    caissonXchgRes => {
      let data = "";

      // A chunk of data has been recieved.
      caissonXchgRes.on("data", chunk => {
        data += chunk;
      });

      // The whole response has been received. Parse the result
      caissonXchgRes.on("end", async () => {
        if (caissonXchgRes.statusCode != 200) {
          // There was an HTTP error. In our example, we'll relay the HTTP error to the user registration web page
          res.send(
            "HTTP error during token exchange",
            caissonXchgRes.statusCode
          );
          return;
        }

        try {
          const checkData = await JSON.parse(data);

          // Check the response from Caisson for errors.
          if (checkData.error) {
            console.error(
              `Error '${checkData.error}' exchanging Caisson Token: "${checkData.error_message}"`
            );
            res.status(500).send("Error exchanging token");
            return;
          }

          // All's good. Now we store the Caisson check_id on the user's record
          let user = getUser(user_id);
          user.caissonCheckID = checkData.check_id;
          setUser(user);

          // Echo back the user ID for which we just exchanged the token.
          res.end(JSON.stringify({ user_id }));
        } catch (e) {
          console.error("Failed to parse response", e);
        }
      });
    }
  );

  caissonXchgReq.on("error", err => {
    console.log("Error: " + err.message);
    res.status(500).send(`Error exchanging token: ${err}`);
  });

  // Issue the call to the Caisson token exchange API
  caissonXchgReq.write(
    JSON.stringify({ check_exchange_token: caisson_exchange_token })
  );
  caissonXchgReq.end();
};

const getIDCheckResult = async (req, res) => {
  if (!req.query || !req.query.user_id) {
    res.status(400).send("invalid input");
    return;
  }

  const user_id = req.query.user_id;
  let user = getUser(user_id);

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
  if (!user.caissonCheckID) {
    res.status(400).send("Missing Caisson check ID");
    return;
  }

  // Use Caisson's GET ID Check API to exchange it for a permanent check_id
  // NOTE: For security reasons we send the Caisson check ID in a header rather
  // than a query param.
  const caissonResultReq = https.request(
    `${CAISSON_API_SERVER}/v1/idcheck`,
    {
      method: "GET",
      headers: {
        Authorization: CAISSON_AUTH_HEADER,
        "X-Caisson-CheckID": user.caissonCheckID
      }
    },
    caissonResultRes => {
      let data = "";

      // A chunk of data has been recieved.
      caissonResultRes.on("data", chunk => {
        data += chunk;
      });

      // The whole response has been received. Parse the result
      caissonResultRes.on("end", async () => {
        if (caissonResultRes.statusCode != 200) {
          // There was an HTTP error. In our example, we'll relay the HTTP error to the user registration web page
          res.send(
            "HTTP error during token exchange",
            caissonResultRes.statusCode
          );
          return;
        }

        try {
          const checkResult = await JSON.parse(data);

          if (checkResult.error == "NOT_VERIFIED") {
            // The user hasn't verified their ID yet.
            console.error(`User '${user_id}' has not yet verified their ID"`);
            res
              .status(500)
              .send(`User '${user_id}' has not yet verified their ID"`);
          } else if (checkResult.error) {
            // Some other error occurred.
            console.error(
              `Error '${checkResult.error}' fetching Caisson ID Check result: "${checkResult.error_message}"`
            );
            res.status(500).send("Error fetching ID Check result");
            return;
          }

          // All's good. Now we store the Caisson ID Check result on the user's record
          let user = getUser(user_id);
          user.idCheckResult = { ...checkResult };
          setUser(user);

          // Send back the fields we need. We don't want to send back the entire object that contains
          // sensitive personal data.
          res.end(
            JSON.stringify({
              user_id,
              id_check_data: {
                first_name: user.idCheckResult.info.first_name,
                last_name: user.idCheckResult.info.last_name
              }
            })
          );
        } catch (e) {
          console.error("Failed to parse response", e);
        }
      });
    }
  );

  caissonResultReq.on("error", err => {
    console.log("Error: " + err.message);
    res.status(500).send(`Error exchanging token: ${err}`);
  });

  // Issue the call to the Caisson token exchange API
  // caissonResultReq.write();
  caissonResultReq.end();
};

const startServer = async () => {
  app.post("/exchangetoken", express.json(), exchangeToken);
  app.get("/idcheckresult", getIDCheckResult);

  app.listen(port, () => console.log(`Listening on port ${port}`));
};

startServer();

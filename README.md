# idcheck-button-example

A simple app to show how to integrate the Caisson ID Check button into your signup flow. The [backend](https://github.com/Caisson/idcheck-button-example/blob/master/nodejs/server.js) uses node.js to emulate a user database and implement the Caisson API. The [frontend](https://github.com/Caisson/idcheck-button-example/blob/master/nodejs/views/index.ejs) is a simple Vue.js app to integrate the Caisson JS Button into a mock signup flow.

## Get your Caisson API keys

If you haven't yet, [sign up for a Caisson account](https://www.caisson.com/signup) and head over to the developer tab where you will find your Caisson API keys. Before you run the example app, you will need to define environment variables containing both your secret and public keys.


## Running Locally

Make sure you have [Node.js](http://nodejs.org/) installed. 

```sh
$ git clone https://github.com/Caisson/idcheck-button-example.git # or clone your own fork
$ cd nodejs
$ export CAISSON_SECRET_API_KEY=<your caisson secret API key here> 
$ export CAISSON_PUBLIC_API_KEY=<your caisson public API key here> 
$ npm start
```



Your app should now be running on [localhost:8080](http://localhost:8080/).


## Documentation

More information about using the Caisson JS Button is available in the Caisson Docs.

- [Getting Started with the Caisson JS Button](https://www.caisson.com/docs/integration/jsbutton/)
- [Caisson Reference JS Button](https://www.caisson.com/docs/reference/jsbutton/)
- [Caisson Reference REST API](https://www.caisson.com/docs/reference/api/)

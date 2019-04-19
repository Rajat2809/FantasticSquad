const express = require('express');
const http = require('http');
const routes = require('./routes');
const session = require('express-session');
var db = require('./db');

var SequelizeStore = require('connect-session-sequelize')(session.Store);

var app = express()

app.use(session({
  secret: 'thisissomekey',
  resave: false,
  saveUninitialized: true,
  store: new SequelizeStore({
    db: db.sequelize
  }),
}))

const server = http.createServer(app);

// Setup  cors setting
app.use(function(req, res, next) {
    // res.header("Access-Control-Allow-Origin", "*");
    // res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    // res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
    res.setHeader("Access-Control-Allow-Headers", "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, Access-Control-Allow-Origin");
    next();
});

// Configure ejs as main render
app.set('view engine', 'ejs');

// Configure routes
app.use('/', routes);

console.log("Starting nodejs server at port 8081")
server.listen(8081)
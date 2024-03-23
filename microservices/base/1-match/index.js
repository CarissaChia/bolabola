var express = require("express")
var { createHandler } = require("graphql-http/lib/use/express")
var { buildSchema } = require("graphql")
var mongoose = require("mongoose");
var { ruruHTML } = require("ruru/server")
var cors = require("cors"); // Import cors
var amqp = require('amqplib'); // Import the amqplib library for async messaging


// Add CORS middleware


// var prometheus = require('prom-client');
// // Create a Prometheus counter
// const counter = new prometheus.Counter({
//   name: 'api_requests_total',
//   help: 'Total number of API requests',
//   labelNames: ['method', 'path'],
// });



mongoose.connect("mongodb://mongodb:27017/matches");

var MatchOverviewSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  name: String,
  home_team: String,
  away_team: String,
  home_score: Number,
  away_score: Number,
  date: Date,
  seats: Number,
});

var MatchDetailsSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  name: String,
  description: String,
  venue: String,
  home_team: String,
  away_team: String,
  home_score: Number,
  away_score: Number,
  date: Date,
  seats: Number,
});

const MatchOverviewModel = mongoose.model("MatchOverview", MatchOverviewSchema, "matches");
const MatchDetailsModel = mongoose.model("MatchDetails", MatchDetailsSchema, "matches");

var schema = buildSchema(`
  type MatchOverview {
    _id: ID
    name: String
    home_team: String
    away_team: String
    home_score: Int
    away_score: Int
    date: String
    seats: Int
  }

  type MatchDetails {
    _id: ID
    name: String
    description: String
    venue: String
    home_team: String
    away_team: String
    home_score: Int
    away_score: Int
    date: String
    seats: Int
  }
  
  type Query {
    matches_overview: [MatchOverview]
    match_details(_id: String): MatchDetails
  }  
`)

// Logging midddleware - just to view logs in the console
function logGraphQLRequests(req, res, next) {
  console.log('GraphQL Request:', {
    query: req.body.query,
    variables: req.body.variables,
    operationName: req.body.operationName,
  });
  next();
}

// The root provides a resolver function for each API endpoint
const root = {
  matches_overview: async () => {
    try {
      return await MatchOverviewModel.find();
    } catch (error) {
      throw error;
    }
  },
  match_details: async ({ _id }) => {
    try {
      return await MatchDetailsModel.findById(new mongoose.Types.ObjectId(_id));
    } catch (error) {
      throw error;
    }
  }
};

// Express server
const app = express();
app.use(cors());
app.use(express.json());

// Create and use the GraphQL handler
app.all(
  "/graphql",
  logGraphQLRequests,
  createHandler({
    schema: schema,
    rootValue: root,
  })
);

// Serve the GraphiQL IDE.
app.get("/", (_req, res) => {
  res.type("html")
  res.end(ruruHTML({ endpoint: "/graphql" }))
})

// app.use((req, res, next) => {
//   counter.inc({ method: req.method, path: req.path });
//   next();
// });
// app.get('/metrics', (req, res) => {
//   res.set('Content-Type', prometheus.register.contentType);
//   res.end(prometheus.register.metrics());
// });

// function to handle incoming json
const handleIncomingMessage = async (data) => {
  // change data to json
  const message = JSON.parse(data.content.toString());
  console.log("Received message:", message);

  // remove the number of seats from the match based on quantity in message
  const match = await MatchOverviewModel.findById(message.match_id);
  console.log(`Match ${match._id} at first had ${match.seats} seats available`);
  match.seats -= message.quantity;
  await match.save();
  console.log(`Match ${match._id} now has ${match.seats} seats available`);
}

// function to set up RabbitMQ consumer
const setupRabbitMQConsumer = async () => {
  try {
     const connection = await amqp.connect('amqp://ticketboost:veryS3ecureP@ssword@rabbitmq/');
     const channel = await connection.createChannel();
     const exchange = 'match-booking-exchange';
     await channel.assertExchange(exchange, 'topic', { durable: true });
     const queue = await channel.assertQueue("match", { durable: true });

     await channel.bindQueue(queue.queue, exchange, "match.#");
 
     console.log("Waiting for messages in %s. To exit press CTRL+C", queue.queue);
 
     // Use the promise-based consume method
     await channel.consume(queue.queue, handleIncomingMessage, { noAck: false });
  } catch (error) {
     console.error("Error setting up RabbitMQ consumer:", error);
  }
 };
 
app.listen(9001)
setupRabbitMQConsumer();
const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("boss is running");
});

app.listen(port, () => {
  console.log(`Bistro boss is running on port ${port}`);
});

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster1.dwhia.mongodb.net/?appName=Cluster1`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    //user data
    const userCollection = client.db("BistroDB").collection("users");

    const menuCollection = client.db("BistroDB").collection("menu");
    const cartCollection = client.db("BistroDB").collection("carts");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token }); // token named with token value
    });

    //middlewares
    const verifyToken = (req, res, next) => {
      console.log("inside verify token: ", req.headers.authorization); //Express automatically passes the request object (req) to the middleware function verifyToken, just like it does for any route handler.
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Forbidden Access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Forbidden Access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    //users related api
    //posting users
    app.post("/users", async (req, res) => {
      const user = req.body;
      //insert email if user doesnt already exist
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User Already Exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    //getting users
    app.get("/users", verifyToken, async (req, res) => {
      // this `req` is the SAME request object passed through middleware
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //isAdmin in Sidebar.jsx
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Unauthorized Access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    //deleting users
    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    //making a user an admin
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin", //we want create a role field with 'admin' as its value on the db
        },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    //getting data from menuCollection
    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    //posting cart info on cartCollection
    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    //getting cart info from cartCollection (of a specific user)
    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email }; //In const query = { email: email };, the left email is the property name (what MongoDB will use to search), and the right email is the variable you got from req.query.email.
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    //deleting a specific cart from cartCollection
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// JWT allows your backend to say:

// “I will only give data to people who show me a valid, signed token from Firebase.”

// So the flow becomes:

// 🔐 Firebase logs in the user.

// 🪪 You send their info to your backend (/jwt route).

// 🧾 Backend creates a JWT and sends it back.

// 💾 You store that JWT in localStorage.

// 🚀 All your backend requests include the token in headers.

// ✅ The backend checks the token before sending protected data.
//Without JWT, your backend has no idea if a request is from a logged-in user or a random person.

// 💡 Breakdown:
// Client side (frontend):

// You use Axios to send a request to the backend, and the config object is modified by the interceptor to include the token in the Authorization header.

// Axios sends this HTTP request to the backend, for example, like this:

// http
// Copy code
// GET http://localhost:5000/users
// Headers:
//   Authorization: Bearer eyJhbGciOi... (your JWT token)
// Backend (Express):

// The server receives the request, and Express automatically creates a req object for you, which contains all the headers, including the Authorization header.

// Your verifyToken middleware looks at the Authorization header from req.headers:

// js
// Copy code
// const token = req.headers.authorization.split(' ')[1];
// It extracts the token from the Authorization header (Bearer eyJhbGciOi...), so token now contains just the actual JWT (the part after the Bearer keyword).

// Token Verification:

// Then, JWT's verify function checks the token by comparing it with the server's secret key (stored in process.env.ACCESS_TOKEN_SECRET).

// If the token is valid and correctly signed, it will "decode" the token and attach the decoded info to req.decoded.

// js
// Copy code
// jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
//    if (err) {
//       return res.status(401).send({ message: 'Forbidden Access' });
//    }
//    req.decoded = decoded;  // Attach the decoded token (user info) to req
//    next();  // Proceed to the next middleware or route handler
// });
// Result:

// If the token is valid, the request will proceed to the next middleware or route handler.

// If the token is invalid or missing, the server responds with a 401 Unauthorized error.

// 🔄 In short:
// The frontend sends the token in the Authorization header.

// The backend (Express) looks for it in req.headers.authorization.

// The verifyToken middleware checks if the token matches what the server expects by verifying it against the secret key (process.env.ACCESS_TOKEN_SECRET).

// If valid, the request is allowed to proceed; if not, an error is thrown.

const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// middleware
const corsOptions = {
  origin: "http://localhost:5173", // <-- your React app URL
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // <-- if you ever need cookies
};
app.use(cors(corsOptions));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("boss is running");
});

app.listen(port, () => {
  console.log(`Bistro boss is running on port ${port}`);
});

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

    const userCollection = client.db("BistroDB").collection("users");
    const menuCollection = client.db("BistroDB").collection("menu");
    const cartCollection = client.db("BistroDB").collection("carts");
    const paymentCollection = client.db("BistroDB").collection("payments");

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
      // console.log("inside verify token: ", req.headers.authorization); //Express automatically passes the request object (req) to the middleware function verifyToken, just like it does for any route handler.
      // console.log(req.body);
      console.log(">>> incoming Authorization header:" ,req.get("Authorization"))
      if (!req.get("Authorization")) {
        return res.status(401).send({ message: "Forbidden Access..." });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized Access" });
        }
        req.decoded = decoded; //an email
        next();
      });
    };

    //use verifyAdmin only after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      console.log(email);
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      next();
    };

    //USER RELATED APIS--------------------------------------------
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
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      // this `req` is the SAME request object passed through middleware
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //show routes related to isAdmin in Sidebar.jsx.. (in useAdmin hook)
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    //deleting users (vT & vA to secure backend, adminRoute to secure frontend)
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    //making a user an admin
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin", //we want create a role field with 'admin' as its value on the db
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    //MENU REALTED APIS
    //getting data from menuCollection--------------------------------------------
    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    //posting data to menuCollection
    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const menuItem = req.body;
      const result = await menuCollection.insertOne(menuItem);
      res.send(result);
    });

    //deleting a specific menu from menuCollection
    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });

    //getting a specific menu item (for update)
    app.get("/menu/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.findOne(query);
      res.send(result);
    });

    //updating that specific item
    app.patch("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          name: item.name,
          recipe: item.recipe,
          image: item.image,
          category: item.category,
          price: item.price,
        },
      };
      const result = await menuCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    //CART RELATED APIS
    //posting cart info on cartCollection--------------------------------------------
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
    app.delete("/carts/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    //PAYMENT RELATED APIS
    // payment intent--------------------------------------------
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // posting payment info
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      //now, delete each item from the cart
      // Convert each string ID to a MongoDB ObjectId. Coercing every incoming id to a string, so TypeScript picks the supported overload.
      const cartObjectIds = payment.cartIds.map(
        (id) => new ObjectId(String(id)) //Even if your cartIds are strings at runtime, TypeScript can't know that unless you explicitly tell it. Without type annotations, TS guesses and might assume: (id: any) => new ObjectId(id) <-- hmm... what if this is a number?
      );
      const query = {
        _id: { $in: cartObjectIds }, //This says: “Find all cart documents whose _id is in that array of ObjectIds.”
      };
      const deleteResult = await cartCollection.deleteMany(query);
      res.send({ paymentResult, deleteResult });
    });

    //getting payment info
    app.get("/payments/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    // update payment status to 'received'
    app.patch("/payments/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status: status },
      };
      try {
        const result = await paymentCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Failed to update payment status:", error);
        res.status(500).send({ message: "Failed to update payment status" });
      }
    });

    //DASHBOARD APIS
    //overview statistics for admin dashboard (four cards on top)--------------------------------------------
    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      const result = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$price" },
            },
          },
        ])
        .toArray();
      const revenue = result[0]?.totalRevenue || 0;

      res.send({
        users,
        menuItems,
        orders,
        revenue,
      });
    });

    //charts. using aggregate pipeline to show amount of sales for each category and percentage of sales in a pie chart
    app.get("/order-stats", verifyToken, verifyAdmin, async (req, res) => {
      console.log(req.body);
      const result = await paymentCollection
        .aggregate([
          {
            $unwind: "$menuItemIds",
          },
          {
            $addFields: {
              menuItemIdObj: { $toObjectId: "$menuItemIds" }, //you need to convert menuItemIds so MongoDB can successfully compare them during the $lookup. The value itself (e.g. "67fbf2784f321252599837fa", which is a string)
            },
          },
          {
            $lookup: {
              from: "menu",
              localField: "menuItemIdObj",
              foreignField: "_id",
              as: "menuItems", //This joins each document with the matching menu item from the menu collection.
            },
          },
          {
            $unwind: "$menuItems", //inside menuItems there's an array of objects (one object to be precise). so we unwind it so the next step-- $menuItems.category works
          },
          {
            $group: {
              _id: "$menuItems.category", //_id is the default key MongoDB uses for grouping results.
              quantity: { $sum: 1 },
              revenue: { $sum: "$menuItems.price" }, //group the sales by category (like "drinks", "dessert", etc.) and calculate how many items sold and how much was earned from each category
            },
          },
          {
            $project: {
              _id: 0, //hide original id field
              category: "$_id", //rename id to category
              quantity: 1, //keep the quantity field
              revenue: 1, //keep the revenue field
            },
          },
        ])
        .toArray();

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
// GET http://localhost:5000/users
// Headers:
//   Authorization: Bearer eyJhbGciOi... (your JWT token)

// Backend (Express):
// The server receives the request, and Express automatically creates a req object for you, which contains all the headers, including the Authorization header.
// Your verifyToken middleware looks at the Authorization header from req.headers:
// const token = req.headers.authorization.split(' ')[1];
// It extracts the token from the Authorization header (Bearer eyJhbGciOi...), so token now contains just the actual JWT (the part after the Bearer keyword).
// Token Verification:
// Then, JWT's verify function checks the token by comparing it with the server's secret key (stored in process.env.ACCESS_TOKEN_SECRET).
// If the token is valid and correctly signed, it will "decode" the token and attach the decoded info to req.decoded.
// If the token is invalid or missing, the server responds with a 401 Unauthorized error.

/* verifyAdmin:
This is used to protect entire routes (like POST /additems or GET /admin/allusers) so only admins can access them at all.
If the user is not an admin, they get blocked immediately before the route handler even runs.

/users/admin/:email API route:
This is used by your frontend (like useAdmin hook) to check if a user is an admin.
It's a read-only check used for conditional rendering (e.g. show/hide admin sidebar links).

THEREFORE:
Middleware is meant to protect, not to respond with data.
Middleware can block or allow a request, but it can’t return a useful response (like { admin: true }) for your frontend to use — because that would interrupt the route logic.
*/

// (vT & vA to secure backend, adminRoute and privateRoute to secure frontend)

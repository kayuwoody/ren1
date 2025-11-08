
import express from "express";
import fiuuRouter from "./routes/fiuu-webhook";

const app = express();
app.use(express.json());
app.use(fiuuRouter);

app.get("/", (req, res) => res.send("Fiuu Node app running"));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server listening on " + port));

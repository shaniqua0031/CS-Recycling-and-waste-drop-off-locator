const express = require("express");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());

// Test route
app.get("/", (req, res) => {
  res.json({
    message: "Smart Recycling API is running!",
  });
});

// Example API route
app.get("/api/locations", (req, res) => {
  res.json([
    {
      id: 1,
      name: "Pretoria Recycling Centre",
      address: "Pretoria, South Africa",
      materials: ["Plastic", "Paper", "Glass", "Metal"],
    },
  ]);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
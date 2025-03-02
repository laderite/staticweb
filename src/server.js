require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

// Default admin password if not set in .env
const DEFAULT_PASSWORD = 'admin123';

// Create Express app
const app = express();
const server = http.createServer(app);

// Set up WebSocket server
const wss = new WebSocket.Server({ 
  server,
  // No authentication for WebSocket connections
  // This allows Roblox clients to connect without authentication
  path: '/ws'
});

console.log('Starting server with authentication enabled');

// Set up session middleware with strict settings
app.use(session({
  secret: process.env.SESSION_SECRET || 'roblox-script-hub-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true if using HTTPS
    maxAge: 3600000, // Session expires after 1 hour
    httpOnly: true,
    sameSite: 'strict'
  },
  name: 'roblox_script_hub_session' // Custom session name
}));

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/static', express.static(path.join(__dirname, 'public')));

// Store connected clients
const clients = new Map();
let nextClientId = 1;

// Authentication middleware for admin routes
const requireAuth = (req, res, next) => {
  console.log('Auth check:', req.session.isAuthenticated ? 'Authenticated' : 'Not authenticated');
  
  if (req.session && req.session.isAuthenticated === true) {
    next();
  } else {
    console.log('Redirecting to login page');
    res.redirect('/login');
  }
};

// Apply authentication to all routes except login and WebSocket
app.use((req, res, next) => {
  // Skip authentication for login page and WebSocket endpoint
  if (req.path === '/login' || req.path === '/ws' || req.path.startsWith('/static/')) {
    return next();
  }
  
  requireAuth(req, res, next);
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  // If already authenticated, redirect to dashboard
  if (req.session && req.session.isAuthenticated) {
    return res.redirect('/');
  }
  
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { password } = req.body;
  
  // Get admin password from .env or use default
  const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
  
  console.log('Login attempt');
  
  // For simplicity, we're doing a direct comparison
  // In production, you should use bcrypt.compare with a hashed password
  if (password === adminPassword) {
    console.log('Login successful');
    
    // Regenerate session to prevent session fixation
    req.session.regenerate(err => {
      if (err) {
        console.error('Error regenerating session:', err);
        return res.redirect('/login?error=2');
      }
      
      // Set authentication flags
      req.session.isAuthenticated = true;
      req.session.loginTime = new Date().toISOString();
      
      res.redirect('/');
    });
  } else {
    console.log('Login failed: incorrect password');
    res.redirect('/login?error=1');
  }
});

app.get('/logout', (req, res) => {
  console.log('Logout requested');
  
  // Properly destroy the session
  if (req.session) {
    req.session.destroy(err => {
      if (err) {
        console.error('Error destroying session:', err);
      }
      
      // Clear the session cookie
      res.clearCookie('roblox_script_hub_session');
      res.redirect('/login');
    });
  } else {
    res.redirect('/login');
  }
});

// API endpoints
app.get('/api/clients', (req, res) => {
  const clientList = Array.from(clients.values()).map(client => ({
    id: client.id,
    userId: client.userId,
    username: client.username,
    gameName: client.gameName,
    jobId: client.jobId,
    connectedAt: client.connectedAt
  }));
  
  res.json(clientList);
});

app.post('/api/send-command', (req, res) => {
  const { clientId, command, params } = req.body;
  
  if (!clientId || !command) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Send to specific client if clientId is provided
  if (clientId !== 'all') {
    const client = clients.get(parseInt(clientId));
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        action: 'command',
        command,
        params: params || {}
      }));
      return res.json({ success: true, message: `Command sent to client ${clientId}` });
    } else {
      return res.status(404).json({ error: 'Client not found or disconnected' });
    }
  }
  
  // Send to all clients if clientId is 'all'
  let sentCount = 0;
  clients.forEach(client => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        action: 'command',
        command,
        params: params || {}
      }));
      sentCount++;
    }
  });
  
  return res.json({ success: true, message: `Command sent to ${sentCount} clients` });
});

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');
  
  let clientData = {
    id: nextClientId++,
    ws,
    connectedAt: new Date()
  };
  
  // Send client ID assignment
  ws.send(JSON.stringify({
    action: 'assignId',
    id: clientData.id
  }));
  
  // Handle messages from clients
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.action === 'register') {
        // Store client information
        clientData.userId = data.userId;
        clientData.username = data.username;
        clientData.jobId = data.jobId;
        clientData.gameName = data.gameName;
        
        // Add to clients map
        clients.set(clientData.id, clientData);
        
        console.log(`Client registered: ${clientData.username} (ID: ${clientData.id})`);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log(`Client disconnected: ${clientData.id}`);
    clients.delete(clientData.id);
  });
});

// Update client script to use the WebSocket path
app.get('/client-script', (req, res) => {
  res.type('text/plain');
  res.send(`
if getgenv().WS then
    getgenv().WS:Close()
    getgenv().WS = nil
end

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local MarketplaceService = game:GetService("MarketplaceService")
local RunService = game:GetService("RunService")
local Stats = game:GetService("Stats")

if not websocket then return end

-- Attempt to connect to the WebSocket server
local success, WS = pcall(websocket.connect, "ws://${req.headers.host}/ws")
if not success then
    print("Failed to connect to WebSocket server:", WS)
    return
end
getgenv().WS = WS

-- Rest of the client script...
`);
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server available at ws://localhost:${PORT}/ws`);
});
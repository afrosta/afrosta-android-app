import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini client on the server
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API: AI Expert Q&A chat
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history } = req.body;
      if (!process.env.GEMINI_API_KEY) {
        return res.status(403).json({ 
          status: "error", 
          message: "GEMINI_API_KEY environment variable is missing on server. Please add your key in Settings > Secrets." 
        });
      }

      const formattedContents = [
        {
          role: "user",
          parts: [{ text: "You are an expert Android developer & devops specialist specializing in wrapping web apps (React, Vue, Vite, SPAs) into native Google Play Store applications using Capacitor or Cordova, compiling to Android App Bundles (AAB) and APKs, configured via Gradle, signing with release keystores, and establishing Digital Asset Links (.well-known/assetlinks.json) on web servers. Be friendly, structured, concise, and provide actionable CLI steps or Gradle code snippet templates that help developers succeed on their first try." }]
        },
        {
          role: "model",
          parts: [{ text: "Understood. I am ready to help developers wrap their web apps, generate configuration assets, manage Gradle compiling to APK or AAB, create release keystores, and debug Digital Asset Links. Ask me anything!" }]
        },
        ...(history || []).map((h: any) => ({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.content }]
        })),
        {
          role: "user",
          parts: [{ text: message }]
        }
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: formattedContents,
      });

      res.json({
        status: "success",
        reply: response.text,
      });
    } catch (error: any) {
      console.error("Gemini API error:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // API: Get current configurations
  app.get("/api/config", (req, res) => {
    try {
      const capConfigPath = path.join(process.cwd(), "capacitor.config.json");
      let capConfig = {};
      if (fs.existsSync(capConfigPath)) {
        capConfig = JSON.parse(fs.readFileSync(capConfigPath, "utf-8"));
      }

      // Check if GitHub workflow exists
      const workflowPath = path.join(process.cwd(), ".github", "workflows", "android.yml");
      const hasWorkflow = fs.existsSync(workflowPath);

      res.json({
        status: "success",
        capConfig,
        hasWorkflow,
      });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // API: Save configurations
  app.post("/api/save", (req, res) => {
    try {
      const { appName, appId, webUrl, option, iconText, iconBg, version, versionCode } = req.body;

      // 1. Create or update capacitor.config.json
      const capConfig: any = {
        appId: appId || "com.webtoandroid.app",
        appName: appName || "WebToAndroid App",
        webDir: "dist",
        bundledWebRuntime: false,
      };

      if (option === "external" && webUrl) {
        capConfig.server = {
          url: webUrl,
          cleartext: true,
        };
      }

      const capConfigPath = path.join(process.cwd(), "capacitor.config.json");
      fs.writeFileSync(capConfigPath, JSON.stringify(capConfig, null, 2), "utf-8");

      // 2. Create .github/workflows/android.yml configuration
      const githubDir = path.join(process.cwd(), ".github", "workflows");
      if (!fs.existsSync(githubDir)) {
        fs.mkdirSync(githubDir, { recursive: true });
      }

      // Write GitHub workflow
      const workflowContent = `# GitHub Actions Workflow to build Android App Bundle (.aab) and APK from WebToAndroid Studio setup
name: Build Android App

on:
  push:
    branches: [ "*" ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Source Code
        uses: actions/checkout@v4

      - name: Set up Java JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'zulu'

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci || npm install

      - name: Build Web Application
        run: npm run build

      - name: Sync Capacitor Android Project
        run: |
          npx cap sync
          npx cap add android || true

      - name: Build Android Release Bundle (.aab)
        run: |
          cd android
          chmod +x gradlew
          ./gradlew bundleRelease

      - name: Build Android Debug APK (.apk)
        run: |
          cd android
          chmod +x gradlew
          ./gradlew assembleDebug

      - name: Upload Release AAB Artifact
        uses: actions/upload-artifact@v4
        with:
          name: app-release-aab
          path: android/app/build/outputs/bundle/release/app-release.aab

      - name: Upload Debug APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: app-debug-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
`;

      const workflowPath = path.join(githubDir, "android.yml");
      fs.writeFileSync(workflowPath, workflowContent, "utf-8");

      res.json({
        status: "success",
        message: "Configurations saved, capacitor.config.json and GitHub Action created successfully!",
      });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

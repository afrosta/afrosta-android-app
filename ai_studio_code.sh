# 1. Initialize git in your project directory
git init

# 2. Add all workspace files
git add .

# 3. Commit the configured build blueprints
git commit -m "Configure Android packaging blueprints for Afrosta.live"

# 4. Set the branch to main
git branch -M main

# 5. Connect this locally to your remote GitHub repository
# (Replace the path below with your actual repository URL shown on GitHub)
git remote add origin https://github.com/YOUR_USERNAME/afrosta-android-app.git

# 6. Push code to GitHub
git push -u origin main
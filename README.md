The Managerial Merry-Go-Round
Version: 2.0
Changelog: Complete rewrite to reflect the current project architecture, including the Firestore backend, React dashboard, and integrated articles.

1. Overview
The Managerial Merry-Go-Round is an interactive data visualization project that explores the relationship between managerial tenure and success at Europe's top football clubs. The project, developed by Jasper Koning in collaboration with Google's Gemini, aims to answer the question: Was Sir Alex Ferguson's long reign at Manchester United an anomaly, or is stability a true indicator of success?

The project consists of three main components:

The D3.js Visualization: A dynamic heatmap that displays the tenures of managers at 35 top European clubs since the 1955/56 season. It visually represents tenure length, trophies won, and allows for advanced filtering, comparison, and a "Career Mode" to track individual managers.

Supporting Articles: A series of articles that use the visualization's data to explore narratives around different types of managers, such as "The Architect vs. The Journeyman."

The React Dashboard: A comprehensive, behind-the-scenes admin panel for managing all project data, which is stored in a Google Firestore database.

2. Technical Architecture
The project leverages a modern web stack to separate data management from the public-facing visualization:

Frontend:

Visualization (index.html): Built with vanilla JavaScript and the D3.js library for powerful, data-driven SVG rendering.

Styling (style.css): A custom stylesheet for the main visualization. Article pages use Tailwind CSS for a distinct, magazine-like feel.

Logic (script.js): Handles all the D3 rendering, user interactions, and data fetching from Firestore for the visualization.

Backend & Data:

Database: Google Firestore serves as the single source of truth, housing collections for clubs, coaches, and seasons. This allows for real-time data updates without redeploying the application.

Data Management (dashboard.html): A sophisticated single-page application built with React and Tailwind CSS. It allows for full CRUD (Create, Read, Update, Delete) operations on all Firestore data.

Serverless Functions (index.js): Google Cloud Functions written in Node.js are used for advanced data processing tasks, such as enriching coach data with images from external APIs.

3. Project Structure
.
├── articles/
│   ├── architectjourneyman.html
│   ├── globaltactician.html
│   └── thegoat.html
├── about.html
├── dashboard.html
├── index.html
├── index.js             # Cloud Functions
├── script.js
├── style.css
└── README.md

4. Local Development Setup
To run the full project locally, you need a simple web server to handle the ES module imports for Firebase.

Prerequisites: Make sure you have Python 3 installed.

Start the Server: Open a terminal in the root directory of the project and run the following command:

# For Python 3
python3 -m http.server

Access the Visualization: Open your web browser and navigate to http://localhost:8000/.

Access the Dashboard: To manage data, navigate to http://localhost:8000/dashboard.html.

5. External Requirements & Configuration
To use the full functionality of this project (especially the dashboard), you will need to set up your own Firebase project.

Firebase Project:

Create a new project on the Firebase Console.

Enable Firestore Database.

Enable Authentication and add Google as a Sign-in provider.

From your project settings, get the firebaseConfig object.

Crucially, you must replace the placeholder firebaseConfig objects in index.html and dashboard.html with your own project's configuration.

Cloud Functions:

To deploy the Cloud Functions in index.js, you will need the Firebase CLI. Follow the official Firebase documentation for setup and deployment instructions.

The functions may require you to enable billing on your Google Cloud project.

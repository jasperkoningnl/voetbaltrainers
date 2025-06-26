# voetbaltrainers

The goal of this project is to visualise the tenure of football coaches across top European clubs. A D3.js heatmap shows each season per club while trophies and coach changes are highlighted. All data is stored in a Google Firestore database, which can be edited through an admin dashboard. The project also integrates with Google's Gemini API to help fill in missing seasons.

## Folder structure

```
.
├── about.html       # Background information and changelog
├── dashboard.html   # React based admin dashboard
├── data/            # Example JSON data used during development
├── index.html       # Main visualisation page
├── script.js        # Heatmap logic and Firestore queries
├── style.css        # Shared styling
└── README.md
```

## Running the visualisation

Serve the repository with any static web server so that ES module imports work correctly:

```bash
python3 -m http.server
```

Then open `http://localhost:8000/index.html` in your browser.

## Running the admin dashboard

Start the same local server and visit `http://localhost:8000/dashboard.html`. Log in with Google to manage the Firestore collections. The AI assistant tab uses the Gemini generative language API and expects the API key from your Firebase configuration.

## External requirements

- A Firebase project with Firestore enabled. Replace the `firebaseConfig` object in `index.html` and `dashboard.html` with your own project's credentials.
- Ensure the `apiKey` used in that config is allowed to call the Gemini API (`generativelanguage.googleapis.com`).


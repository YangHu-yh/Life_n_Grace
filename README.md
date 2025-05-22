# Life 'n' Grace - Prayer Journal Application

This is a web application for noting down needs and prayers, with AI-powered prayer suggestions.

## Prerequisites

*   Python (Python 3.8-3.12 is recommended for Django 4.2)
*   pip (Python package installer)
*   Git (for version control, optional for local setup but good practice)

## Getting Started

These instructions assume you have the project files in a directory named `life_n_grace`.

1.  **Navigate to the Project Directory**:
    Open your terminal and change to the project's root directory (the `life_n_grace` folder):
    ```bash
    cd path/to/your/life_n_grace
    ```

2.  **Create and Activate a Virtual Environment** (Recommended):
    From within the `life_n_grace` directory:
    ```bash
    python3 -m venv venv
    source venv/bin/activate  # On Windows, use `venv\Scripts\activate`
    ```

3.  **Install Dependencies**:
    Install the required Python packages:
    ```bash
    pip install -r requirements.txt
    ```

4.  **Set Environment Variables**:
    This application uses the Google Gemini API for AI prayer suggestions. You need to set your API key as an environment variable.
    In your terminal (for the current session):
    ```bash
    export GOOGLE_API_KEY="YOUR_API_KEY_HERE"
    ```
    Replace `"YOUR_API_KEY_HERE"` with your actual Google API key. 
    *   For persistent storage across terminal sessions, consider adding this line to your shell's configuration file (e.g., `~/.zshrc`, `~/.bashrc`, or `~/.profile`) and then sourcing the file (e.g., `source ~/.zshrc`) or opening a new terminal.
    *   Alternatively, you can use a `.env` file by creating a file named `.env` in the `life_n_grace` directory with the line `GOOGLE_API_KEY="YOUR_API_KEY_HERE"` and modifying `prayers/gemini_client.py` to load it using a library like `python-dotenv` (this would require adding `python-dotenv` to `requirements.txt` and updating the client code).

5.  **Apply Database Migrations**:
    This will set up your database schema. Ensure you are in the `life_n_grace` directory where `manage.py` is located.
    ```bash
    python manage.py migrate
    ```

6.  **Run the Development Server**:
    ```bash
    python manage.py runserver
    ```

7.  **Access the Application**:
    Open your web browser and go to:
    `http://127.0.0.1:8000/prayers/`

## Project Structure Overview

*   `life_n_grace/`: The root directory for this application.
    *   `manage.py`: Django's command-line utility for interacting with your project.
    *   `requirements.txt`: A list of Python packages required for the project.
    *   `db.sqlite3`: The SQLite database file (default for development).
    *   `prayer_app_project/`: The Django **project** configuration directory.
        *   `settings.py`: Core project settings (database, installed apps, static files, etc.).
        *   `urls.py`: Main URL routing for the entire project.
        *   `wsgi.py`, `asgi.py`: Entry points for web servers.
    *   `prayers/`: A Django **app** dedicated to handling prayer-related features.
        *   `models.py`: Defines the database tables/schema for prayers.
        *   `views.py`: Contains the logic for handling web requests and returning responses.
        *   `forms.py`: Defines forms for user input (e.g., adding a prayer).
        *   `templates/prayers/`: Contains HTML templates specific to the prayers app.
        *   `urls.py` (inside `prayers/`): URL routing specific to the prayers app.
        *   `gemini_client.py`: Module for interacting with the Google Gemini API.
        *   `migrations/`: Stores database migration files.
    *   `venv/` (if created): Directory for the Python virtual environment. 
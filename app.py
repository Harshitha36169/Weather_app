from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
import requests
import os
from dotenv import load_dotenv
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = 'weather-app-secret-key-123'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///users.db'

db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.login_view = 'login'
login_manager.init_app(app)

import os
from werkzeug.utils import secure_filename

# Configuration for Profile Pictures
UPLOAD_FOLDER = 'static/uploads/profile_pics'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Database Model
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    profile_pic = db.Column(db.String(255), default='default_avatar.png')
    cities = db.relationship('City', backref='owner', lazy=True)

# ... (keep existing routes until dashboard)

@app.route("/profile", methods=['GET', 'POST'])
@login_required
def profile():
    return render_template("profile.html", user=current_user)

@app.route("/update_profile", methods=['POST'])
@login_required
def update_profile():
    new_username = request.form.get('username')
    new_password = request.form.get('password')
    file = request.files.get('profile_pic')

    # Update Username
    if new_username and new_username != current_user.username:
        if User.query.filter_by(username=new_username).first():
            flash('Username already taken', 'error')
        else:
            current_user.username = new_username
            flash('Username updated', 'success')

    # Update Password
    if new_password:
        current_user.password = generate_password_hash(new_password)
        flash('Password updated', 'success')

    # Update Profile Pic
    if file and file.filename != '' and allowed_file(file.filename):
        filename = secure_filename(f"user_{current_user.id}_{file.filename}")
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
        current_user.profile_pic = filename
        flash('Profile picture updated', 'success')

    db.session.add(current_user) # Ensure user is attached to session
    db.session.commit()
    return redirect(url_for('profile'))

@app.route("/remove_profile_pic", methods=['POST'])
@login_required
def remove_profile_pic():
    current_user.profile_pic = 'default_avatar.png'
    db.session.commit()
    flash('Profile picture removed', 'success')
    return redirect(url_for('profile'))

class City(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Create DB
with app.app_context():
    db.create_all()

API_KEY = os.getenv("API_KEY")

# --- Authentication Routes ---

@app.route("/")
def landing():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    return render_template("landing.html")

@app.route("/signup", methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        user_exists = User.query.filter_by(username=username).first()
        if user_exists:
            flash('Username already exists', 'error')
            return redirect(url_for('signup'))
        
        new_user = User(username=username, password=generate_password_hash(password))
        db.session.add(new_user)
        db.session.commit()
        
        flash('Account created successfully! Please login.', 'success')
        return redirect(url_for('login'))
        
    return render_template("signup.html")

@app.route("/login", methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        user = User.query.filter_by(username=username).first()
        
        if not user or not check_password_hash(user.password, password):
            flash('Login failed. Check your username and password.', 'error')
            return redirect(url_for('login'))
        
        login_user(user)
        return redirect(url_for('dashboard'))
        
    return render_template("login.html")

@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for('landing'))

# --- Weather Routes ---

@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("index.html", user=current_user)

@app.route("/weather")
@login_required
def get_weather():
    city = request.args.get("city")
    lat = request.args.get("lat")
    lon = request.args.get("lon")
    
    if city:
        url = f"https://api.openweathermap.org/data/2.5/weather?q={city}&appid={API_KEY}&units=metric"
    elif lat and lon:
        url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={API_KEY}&units=metric"
    else:
        return jsonify({"error": "No location provided"}), 400
    
    try:
        response = requests.get(url)
        data = response.json()
        
        if response.status_code != 200:
            return jsonify({"error": data.get("message", "City not found")}), 404
        
        weather_data = {
            "city": data["name"],
            "temp": round(data["main"]["temp"]),
            "feels_like": round(data["main"]["feels_like"]),
            "description": data["weather"][0]["description"].capitalize(),
            "main": data["weather"][0]["main"],
            "humidity": data["main"]["humidity"],
            "wind": data["wind"]["speed"],
            "icon": data["weather"][0]["icon"],
            "temp_min": round(data["main"]["temp_min"]),
            "temp_max": round(data["main"]["temp_max"]),
            "country": data["sys"]["country"],
            "dt": data["dt"],
            "sunrise": data["sys"]["sunrise"],
            "sunset": data["sys"]["sunset"],
            "timezone": data["timezone"]
        }
        
        return jsonify(weather_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/forecast")
@login_required
def get_forecast():
    city = request.args.get("city")
    
    if not city:
        return jsonify({"error": "City required"}), 400
        
    url = f"https://api.openweathermap.org/data/2.5/forecast?q={city}&appid={API_KEY}&units=metric"
    
    try:
        response = requests.get(url)
        return jsonify(response.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Favorites Routes ---

@app.route("/add_city", methods=['POST'])
@login_required
def add_city():
    data = request.json
    city_name = data.get('city')
    
    if not city_name:
        return jsonify({"error": "City name required"}), 400
        
    # Check if city already exists for user
    existing_city = City.query.filter_by(name=city_name, user_id=current_user.id).first()
    if existing_city:
        return jsonify({"message": "City already in favorites"}), 200
        
    new_city = City(name=city_name, owner=current_user)
    db.session.add(new_city)
    db.session.commit()
    
    return jsonify({"message": "City added to favorites"}), 201

@app.route("/remove_city", methods=['POST'])
@login_required
def remove_city():
    data = request.json
    city_name = data.get('city')
    
    city = City.query.filter_by(name=city_name, user_id=current_user.id).first()
    if city:
        db.session.delete(city)
        db.session.commit()
        return jsonify({"message": "City removed"}), 200
    
    return jsonify({"error": "City not found"}), 404

@app.route("/get_cities")
@login_required
def get_cities():
    cities = City.query.filter_by(user_id=current_user.id).all()
    return jsonify([city.name for city in cities])

if __name__ == "__main__":
    app.run(debug=True)

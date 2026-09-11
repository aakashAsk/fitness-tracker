# Fitness Tracker Pro

## 📱 Overview
**Fitness Tracker Pro** is a comprehensive, cross-platform mobile application built with React Native that empowers users to take full control of their health journey. Users can plan workouts, log exercises with precise weight/reps, track nutrition, and manage their entire daily schedule through an interactive calendar—all while receiving intelligent reminders for water, meals, and gym sessions.

Built on a robust **Supabase (PostgreSQL)** backend with a dedicated **Node.js microservice** for background processing, the app is designed for scalability, offline resilience, and real-time synchronization.

---

## ✨ Features

### Core Functionality
- **Workout Planning & Logging**  
  Create custom routines or choose from a built-in exercise library. Log every set with weight, reps, and rest times. Automatic detection of Personal Records (PRs).

- **Comprehensive Exercise History**  
  View past performance for any exercise. Interactive charts show your strength progression and volume trends over time.

- **Diet & Meal Tracking**  
  Log meals with detailed macros (calories, protein, carbs, fats). Track water intake and supplement usage throughout the day.

- **Unified Smart Calendar**  
  A weekly/monthly view (inspired by Microsoft Teams) that aggregates your **workout sessions, meal times, supplement intake, and water breaks** into a single timeline. Drag to reschedule or tap to edit.

- **Intelligent Reminders**  
  Push notifications for hydration, meal times, gym sessions, supplement doses, and even rest periods between sets. Powered by a background worker that checks your schedule in real-time.

### Advanced & Gamification Features
- **Progress Analytics Dashboard**  
  Beautiful graphs for weight trends, body measurements, 1-Rep Max (1RM) progression, and calorie surplus/deficit.

- **AI-Powered Workout Suggestions**  
  Based on your past performance and recovery data, the app suggests optimal weights and rep ranges for your next session to ensure progressive overload.

- **Wearable & Health Integrations**  
  Sync with Apple HealthKit and Google Fit to import steps, active energy, heart rate, and sleep data, providing a holistic view of your fitness.

- **Barcode Scanner & Food Database**  
  Instantly log packaged foods by scanning barcodes (integrated with Nutritionix/OpenFoodFacts). Save custom recipes for quick logging.

- **Social Challenges & Leaderboards**  
  Connect with friends, compete in weekly challenges, and share workout summaries.

- **Gamification & Streaks**  
  Earn XP, unlock achievement badges, and maintain daily streaks to stay motivated.

- **Offline-First Architecture**  
  Log workouts and meals even without an internet connection. Data is cached locally via SQLite and synced automatically when connectivity is restored.

- **Dark Mode & Customizable Dashboard**  
  Fully themable interface with drag-and-drop widgets for a personalized home screen.

---

## 🏗️ Architecture

The application follows a **clean, decoupled architecture** separating the mobile client, the real-time backend, and the asynchronous task worker.

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    React Native Mobile App                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│  │   UI Layer  │  │ State (Zustand)│  │ TanStack   │               │
│  │ (Screens/   │◄─┤  & React     │◄─┤   Query    │               │
│  │  Components)│  │  Query Cache │  │ (API Calls)│               │
│  └─────────────┘  └─────────────┘  └──────┬──────┘               │
│         ▲                     ▲            │                       │
│         │                     │            ▼                       │
│  ┌──────┴─────────────────────┴─────────────────────────┐        │
│  │            Local Storage (SQLite / Expo-SQLite)       │        │
│  └───────────────────────────────────────────────────────┘        │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ HTTPS / Realtime WebSockets
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Supabase Platform                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │    Auth      │  │  Realtime    │  │       Storage            │ │
│  │ (JWT/Google) │  │ Subscriptions│  │ (Profile/Meal Images)    │ │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ SQL Queries / Row Level Security
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                PostgreSQL Database (Relational)                    │
│  Tables: profiles, workout_sessions, exercise_sets, meal_logs,    │
│  calendar_events, reminders, food_items, social_friends           │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ Database Webhooks / Scheduled Jobs
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                Node.js Background Worker Service                   │
│  - Runs every 5 minutes (Cron Jobs)                               │
│  - Checks upcoming calendar events & sends Push Notifications     │
│  - Executes AI logic to suggest workout adjustments               │
│  - Aggregates analytics data for charts                           │
└─────────────────────────────────────────────────────────────────────┘
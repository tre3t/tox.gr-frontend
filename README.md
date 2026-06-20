# tox.gr / tox.cy — Project Brief

---

## What We Built

A full-stack Greek social messaging platform with an AI assistant called **ΗΡΑ (Hera)**.
Two domains, one backend, same codebase: **tox.gr** and **tox.cy**.

---

## Architecture

| Layer | Technology | Details |
|---|---|---|
| Frontend | Static HTML/CSS/JS | Hosted 
| Backend | Node.js / Express | Cloud Run
| Database | Supabase PostgreSQL | 


## Features Summary

### ΗΡΑ AI Chat
- Gemini 3.5 Flash with Greek system prompt
- Session persistence (localStorage + DB)
- File/image attachment support
- Anonymous mode (no login required)
- Anon history passed per-request

### Ροή (Feed)
- Public posts (3/day) and Friends posts (10/day)
- Image upload with client-side resize
- GIF support via Giphy
- Likes + comments
- User profile click-through
- Lightbox for images

### Μηνύματα (Messages) — sub-tabs
**Άτομα (People/DMs):**
- Friends list with search
- Friend requests (send/accept/remove)
- Direct messages with 3s poll
- GIF support
- Swipe-to-delete on mobile
- ΗΡΑ AI auto-reply toggle
- Online presence dots (green, 5-min heartbeat window)

**Ομάδες (Groups):**
- Create group with friend picker
- Group chat with 3s poll
- GIF support
- Creator can delete group

### Νήματα (Threads Forum)
- 5 categories with colour coding
- Search bar (filters title + content)
- Thread cards with like/reply counts
- Thread detail view with full content
- Replies with individual like buttons
- Authors can delete own threads/replies
- Create thread modal with category selector
- Floating action button (FAB) to create

### Profiles & Social
- Own profile with avatar (stored in localStorage as base64)
- Other users' profiles with post grid
- Block/unblock users
- Reputation gifting (⭐, 1/day limit)

## Planned Feature: Notifications

### What to build
Real-time notification badges when users receive:
- A new friend request
- A DM from a friend
- A like or comment on their post
- A like or reply on their thread
- A reputation gift

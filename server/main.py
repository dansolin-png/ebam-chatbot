from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routes import chat, admin, leads

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="EBAM Chatbot API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(leads.router, prefix="/api")


@app.get("/")
def root():
    return {"status": "ok", "message": "EBAM Chatbot API"}


@app.get("/health")
def health():
    return {"status": "healthy"}

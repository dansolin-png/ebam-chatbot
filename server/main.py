from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from routes import chat, admin, leads, auth

app = FastAPI(title="EBAM Chatbot API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://main.d142ap2pr34amq.amplifyapp.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(leads.router, prefix="/api")


@app.get("/")
def root():
    return {"status": "ok", "message": "EBAM Chatbot API"}


@app.get("/health")
def health():
    return {"status": "healthy"}


# Lambda handler
handler = Mangum(app, lifespan="off")

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="ArcticAIChatbotti agent", version="0.1.0")


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class ChatResponse(BaseModel):
    reply: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "development"}


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Viestin on sisallettava tekstiä.")

    return ChatResponse(
        reply=(
            "Kehitysagentti vastaanotti viestin. Paikallista kielimallia ei ole viela "
            "liitetty tähän palveluun."
        )
    )

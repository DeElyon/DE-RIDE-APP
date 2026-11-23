import os


async def generate(system: str, prompt: str) -> str:
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="AI provider is not configured")
    from groq import AsyncGroq

    client = AsyncGroq(api_key=api_key)
    result = await client.chat.completions.create(
        model=os.getenv("GROQ_CHAT_MODEL", "llama-3.3-70b-versatile"),
        messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        max_tokens=int(os.getenv("GROQ_MAX_TOKENS", "500")),
        temperature=float(os.getenv("GROQ_TEMPERATURE", "0.75")),
    )
    return result.choices[0].message.content or ""

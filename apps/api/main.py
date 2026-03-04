from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from groq import Groq
from pydantic import BaseModel
import os
from dotenv import load_dotenv
import json

load_dotenv()

app = FastAPI()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


# ----------- Pydantic Models -----------

class ChatRequest(BaseModel):
    messages: list

class AnalyzeRequest(BaseModel):
    text: str

class ExtractRequest(BaseModel):
    text: str

class RouteRequest(BaseModel):
    category: str


# ----------- Department Mapping -----------

DEPARTMENT_MAP = {
    "Drainage": "Municipal Drainage Department",
    "Road Issues": "Public Works Department",
    "Street Lighting": "Electricity Department",
    "Waste Management": "Sanitation Department",
    "Water Supply": "Water Authority"
}


# ----------- Helper Functions -----------

def detect_complaint(text):

    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": """
Determine if the user message describes a civic problem.

Return only:
YES
or
NO
"""
            },
            {"role": "user", "content": text}
        ]
    )

    result = completion.choices[0].message.content.strip()

    return result == "YES"


def extract_complaint(text):

    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": """
Extract civic complaint information.

Understand English, Hindi and Hinglish complaints.

Categories:
Drainage
Road Issues
Street Lighting
Waste Management
Water Supply

Severity levels:
Low
Medium
High
Critical

Return ONLY valid JSON like:

{
 "category": "...",
 "severity": "...",
 "description": "...",
 "location": "..."
}

If location unknown return "unknown".
"""
            },
            {"role": "user", "content": text}
        ]
    )

    response = completion.choices[0].message.content.strip()

    try:
        return json.loads(response)
    except:
        return {
            "category": "Unknown",
            "severity": "Medium",
            "description": text,
            "location": "unknown"
        }

# ----------- Endpoints -----------

@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/analyze")
def analyze(request: AnalyzeRequest):

    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": """
You are an AI that categorizes civic complaints.
Understand English, Hindi and Hinglish complaints.

Example Hinglish complaints:
"mere ghar ke paas bada gadda hai"
"street light kaam nahi kar rahi"

Possible categories:
Drainage
Road Issues
Street Lighting
Waste Management
Water Supply

Severity levels:
Low
Medium
High
Critical

Return ONLY JSON:

{
 "category": "...",
 "severity": "..."
}
"""
            },
            {"role": "user", "content": request.text}
        ]
    )

    return json.loads(completion.choices[0].message.content)


@app.post("/extract")
def extract(request: ExtractRequest):
    return extract_complaint(request.text)


@app.post("/route")
def route(request: RouteRequest):

    department = DEPARTMENT_MAP.get(request.category, "General Department")

    return {
        "category": request.category,
        "assigned_department": department
    }


@app.post("/chat")
def chat(request: ChatRequest):

    user_message = request.messages[-1]["content"]

    if detect_complaint(user_message):
        extract_complaint(user_message)

    def stream():

        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                "role": "system",
                "content": """
                You are Seva, a civic assistant helping citizens report public issues.

                You must understand English, Hindi and Hinglish (Hindi written in English letters).

                Examples of Hinglish:
                "mere yha street light nhi chl rhi"
                "road pe bada gadda hai"
                "pani supply band hai"

                Interpret these correctly and help the citizen report the issue.

                Be polite, helpful and professional like a government assistant.
                """
                }
            ] + request.messages,
            stream=True
        )

        for chunk in completion:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    return StreamingResponse(stream(), media_type="text/plain")
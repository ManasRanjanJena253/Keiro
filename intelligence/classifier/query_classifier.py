from google import genai
from dotenv import load_dotenv
from pydantic import BaseModel
from pathlib import Path

class ResponseSchema(BaseModel):
    query_type: str
    domain: str

class ClassifyQuery:
    def __init__(self, client: genai.Client, model_name: str = "gemini-2.5-flash"):
        self.client = client

        prompt_path = Path(__file__).parent / "classifier_system_prompt.txt"
        try:
            with open(prompt_path, mode = "r") as f:
                self.prompt = f.read()
        except Exception as e:
            raise ValueError(f"Unable to open the prompt file. ERROR: {e}")

        self.model = model_name

    def classify(self, query: str):
        complete_prompt = self.prompt.replace("{query}", query)
        try:
            response = self.client.models.generate_content(
                model = self.model,
                contents = complete_prompt,
                config = {
                    "response_mime_type": "application/json",
                    "response_schema": ResponseSchema
                }
            )

        except Exception as e:
            return {"query_type": "simple", "domain": None}

        try:
            classified_query: ResponseSchema = response.parsed
        except Exception as e:
            return {"query_type": "simple", "domain": None}
        return classified_query



from google import genai
from dotenv import load_dotenv
from pydantic import BaseModel
from openai import OpenAI
from pathlib import Path
from typing import Literal, Union

class ResponseSchema(BaseModel):
    query_type: Literal["simple", "complex", "multi_hop"]
    domain: str | None = None

class ClassifyQuery:
    def __init__(self, client: Union[genai.Client, OpenAI], model_name: str, model_provider: Literal["openai", "gemini", "ollama"]):
        self.client = client
        self.model_provider = model_provider

        prompt_path = Path(__file__).parent / "classifier_system_prompt.txt"
        try:
            with open(prompt_path, mode = "r") as f:
                self.prompt = f.read()
        except Exception as e:
            raise ValueError(f"Unable to open the prompt file. ERROR: {e}")

        self.model = model_name

    def classify(self, query: str):
        complete_prompt = self.prompt.replace("{query}", query)

        if self.model_provider == "gemini":
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
                return ResponseSchema(
                    query_type = "simple",
                    domain = None
                )

            try:
                classified_query: ResponseSchema = response.parsed
            except Exception as e:
                return ResponseSchema(
                    query_type = "simple",
                    domain = None
                )
            return classified_query

        elif self.model_provider in  ["openai", "ollama"]:
            try:
                response = self.client.chat.completions.create(
                    model = self.model,
                    response_format = {"type": "json_object"},
                    messages = [
                        {"role": "user", "content": complete_prompt}
                    ]
                )

            except Exception as e:
                return ResponseSchema(
                    query_type = "simple",
                    domain = None
                )

            try:
                response_json = response.choices[0].message.content
                return ResponseSchema.model_validate_json(response_json)
            except Exception as e:
                return ResponseSchema(
                    query_type = "simple",
                    domain = None
                )
        else:
            return ResponseSchema(
                    query_type = "simple",
                    domain = None
                )
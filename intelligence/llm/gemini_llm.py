from .base_llm import BaseLLM
from google import genai

class GeminiLLM(BaseLLM):
    def __init__(self, client: genai.Client, model_name: str):
        super().__init__(client, model_name)

    def get_response(self, query: str, chunks: list[str]):
        chunk_str = "\n".join(chunks)
        prompt = self.raw_prompt.replace("{query}", query).replace("{context}", chunk_str)

        response = self.client.models.generate_content(
            model = self.model,
            contents = prompt
        )

        return {
            "response": response.text,
            "prompt_tokens": response.usage_metadata.prompt_token_count,
            "completion_tokens": response.usage_metadata.candidates_token_count,
            "model": self.model
        }
from .base_llm import BaseLLM
from openai import OpenAI

class OpenaiLLM(BaseLLM):
    def __init__(self, client: OpenAI, model_name: str):
        super().__init__(client = client, model_name = model_name)

    def get_response(self, query: str, chunks: list[str]):
        chunks_str = "\n".join(chunks)
        prompt = self.raw_prompt.replace("{query}", query).replace("{context}", chunks_str)

        response = self.client.chat.completions.create(
            model = self.model,
            messages = [{"role": "user", "content": prompt}]
        )

        return {
            "response": response.choices[0].message.content,
            "prompt_tokens": response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens,
            "model": self.model
        }
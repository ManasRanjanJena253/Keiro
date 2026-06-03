from abc import abstractmethod, ABC
from pathlib import Path

class BaseLLM(ABC):
    def __init__(self, client, model_name):
        self.client = client
        self.model = model_name

        prompt_path = Path(__file__).parent / "llm_prompt.txt"
        try:
            with open(prompt_path, mode = "r") as f:
                self.raw_prompt = f.read()
        except Exception as e:
            raise ValueError(f"Unable to open the prompt file. ERROR: {e}")

    @abstractmethod
    def get_response(self, query: str, chunks: list[str]):
        raise NotImplementedError

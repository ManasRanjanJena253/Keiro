from pypdf import PdfReader
import io

def load_document(content: bytes, mime_type: str) -> str:

    if mime_type == "application/pdf":
        try:
            pdf_reader = PdfReader(io.BytesIO(content))
        except Exception as e:
            raise ValueError(f"Couldn't read content from the bytes. ERROR : {e}")

        num_pages = len(pdf_reader.pages)
        text_content = ""
        for i in range(num_pages) :
            try:
                page = pdf_reader.pages[i]
                text_content += page.extract_text()
            except Exception as e:
                raise ValueError(f"Couldn't extract text. ERROR : {e}")
        return text_content

    elif mime_type == "text/plain":
        try:
            text = content.decode("utf-8")
        except Exception as e:
            raise ValueError(f"Couldn't convert the text file content. ERROR : {e} ")

        return text
    else :
        raise ValueError("Unsupported File")
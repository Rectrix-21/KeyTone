from fastapi import HTTPException, status


class APIError(HTTPException):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(status_code=status_code, detail=detail)


class CreditExhaustedError(APIError):
    def __init__(self) -> None:
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail="No credits remaining")


class UnsupportedAudioError(APIError):
    def __init__(self) -> None:
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported audio file type")


class FileTooLargeError(APIError):
    def __init__(self) -> None:
        super().__init__(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Uploaded file exceeds size limit")

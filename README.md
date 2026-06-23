# QA-Pariksha
class TestCaseRequest(BaseModel):
    uuid: str
    document_name: str
    user_prompt: Optional[str] = None
    selected_department: Optional[str] = None
    rag_doc_ids: Optional[List[str]] = None
    rtm_mode: bool = False
    selected_requirements: Optional[List[dict]] = None

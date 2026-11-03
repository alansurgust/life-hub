# Lazy load categorizer to avoid importing openai/google packages on startup
def batch_categorize_transactions(*args, **kwargs):
    from app.ai.categorizer import batch_categorize_transactions as _fn
    return _fn(*args, **kwargs)

def learn_user_rule(*args, **kwargs):
    from app.ai.categorizer import learn_user_rule as _fn
    return _fn(*args, **kwargs)

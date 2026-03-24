import re
from collections import Counter
from typing import List

STOPWORDS = {
    'the','and','for','with','that','this','from','into','will','work','team','teams','using','used','user','users','business','data',
    'job','role','years','year','required','preferred','including','across','within','through','their','they','our','your','you',
    'ability','skills','experience','development','support','system','systems','process','processes','program','programs','analysis'
}

PHRASES = [
    'business requirements',
    'workflow mapping',
    'user journeys',
    'user stories',
    'quality assurance',
    'user acceptance testing',
    'system integration',
    'project management',
    'stakeholder engagement',
    'functional processes',
    'requirements development',
    'software development lifecycles'
]


def extract_keywords(text: str, limit: int = 5) -> List[str]:
    text_l = (text or '').lower()
    selected = []
    for phrase in PHRASES:
        if phrase in text_l and phrase not in selected:
            selected.append(phrase)
        if len(selected) >= limit:
            return selected

    tokens = re.findall(r"[a-zA-Z][a-zA-Z\-]+", text_l)
    counter = Counter(t for t in tokens if len(t) >= 4 and t not in STOPWORDS)
    for token, _ in counter.most_common(limit * 3):
        if token not in selected:
            selected.append(token)
        if len(selected) >= limit:
            break
    return selected[:limit]

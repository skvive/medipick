"""Selective field encryption for appointment contact data at rest.
Not a substitute for encryption of backups, audit trails, application access controls,
KMS or a full data protection impact assessment.
"""
import hashlib,base64
from cryptography.fernet import Fernet,InvalidToken
PREFIX='ENC_V1:'
def cipher(secret):
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret+b'|appointment-fields|v1').digest()))
def encrypt(value,secret):return PREFIX+cipher(secret).encrypt(str(value).encode('utf-8')).decode('ascii')
def decrypt(value,secret):
    value=str(value)
    if not value.startswith(PREFIX):return value # legacy row, migration tool recommended
    try:return cipher(secret).decrypt(value[len(PREFIX):].encode('ascii')).decode('utf-8')
    except InvalidToken:raise ValueError('예약 연락처 복호화 실패: 암호화 키 변경 여부 확인')
def admin_appointment(row,secret):
    obj=dict(row)
    for k in ('visitor_name','phone'):
        if k in obj:obj[k]=decrypt(obj[k],secret)
    return obj

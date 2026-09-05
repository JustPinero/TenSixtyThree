Domain registered on Resend: mail.tensixtythree.com (id 6530aa7d-e120-465a-b8a6-cdfe2b0c75a9, status not_started)

Add these records at GoDaddy (tensixtythree.com zone):

  DKIM   TXT   name: resend._domainkey.mail                   value: p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDXMB39tGEWYtrFwVeW4v+fM/mjFLOKdvhLbEYV4zsixVTCeX9FJ/gdfqjLG8YW+2NR92jVCnSlOPq0OnGcIx0Vm16dqjJGraHbuXof1ghw/SfkCwGQd+urzl/lGOkxfFwxApH5q2J4L/gnd6B/BdCwGyp2lXAb/F2mMCLSyg0aTwIDAQAB
  SPF    MX    name: send.mail                                value: feedback-smtp.us-east-1.amazonses.com  priority: 10
  SPF    TXT   name: send.mail                                value: v=spf1 include:amazonses.com ~all

After adding, verification triggers automatically (or ask Kilroy to POST /domains/{id}/verify).

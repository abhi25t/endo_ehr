
#export GOOGLE_APPLICATION_CREDENTIALS=skan-radiology-prism-c0d90808a981.json
# pip install vertexai google-genai
# https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions#gemini-models

import os
import wave
import pyaudio
import vertexai
from google.auth import default
from vertexai.generative_models import GenerativeModel, Part

# --------- CONFIG ---------

LOCATION = "us-central1"       # Gemini Pro is robust in us-central1

creds, PROJECT_ID = default()
# Initialize Vertex AI
vertexai.init(project=PROJECT_ID, location=LOCATION)
model = GenerativeModel("gemini-2.5-flash")
# --------------------------

def gemini_test():
    prompt = "Who is the president of USA?"

    print("Sending to Gemini...")
    responses = model.generate_content([prompt], stream=True)

    for response in responses:
        print(response.text, end="", flush=True)

if __name__ == "__main__":
    gemini_test()

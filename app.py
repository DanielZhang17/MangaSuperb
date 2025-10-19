from flask import Flask, request, jsonify, send_from_directory
import google.generativeai as genai
import os
import json
import base64
from PIL import Image
import io

app = Flask(__name__, static_folder='static')

# Configure CORS for development
from flask_cors import CORS
CORS(app)

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/generate-manga', methods=['POST'])
def generate_manga():
    """
    Generate manga script and images using Google Gemini API
    """
    try:
        data = request.json
        prompt = data.get('prompt', '')
        model_name = data.get('model', 'gemini-2.5-flash')
        api_key = data.get('api_key', '')

        if not prompt:
            return jsonify({'error': 'Prompt is required'}), 400

        if not api_key:
            return jsonify({'error': 'API key is required'}), 400

        # Configure Gemini API
        genai.configure(api_key=api_key)

        # Generate manga script
        script_model = genai.GenerativeModel(model_name)

        script_prompt = f"""You are a manga scriptwriter. Based on the following idea, create a detailed manga script with:
1. A brief story summary
2. 4-6 panel descriptions with dialogue and scene details
3. Character descriptions
4. Visual style notes

User idea: {prompt}

Format your response as JSON with this structure:
{{
    "title": "Manga Title",
    "summary": "Brief story summary",
    "panels": [
        {{
            "panel_number": 1,
            "scene": "Scene description",
            "dialogue": "Character dialogue",
            "visual_notes": "Visual style and composition notes"
        }}
    ],
    "characters": ["Character 1 description", "Character 2 description"],
    "style_notes": "Overall visual style"
}}"""

        script_response = script_model.generate_content(script_prompt)
        script_text = script_response.text

        # Extract JSON from response (handle markdown code blocks)
        if '```json' in script_text:
            script_text = script_text.split('```json')[1].split('```')[0].strip()
        elif '```' in script_text:
            script_text = script_text.split('```')[1].split('```')[0].strip()

        manga_script = json.loads(script_text)

        # Generate images for each panel using Imagen (if available)
        # Note: Imagen 3 is available through Gemini API
        images = []

        # Check if model supports image generation
        image_model_name = 'gemini-2.5-flash'  # Example image-capable model

        try:
            image_model = genai.GenerativeModel(image_model_name)

            for panel in manga_script.get('panels', []):
                image_prompt = f"""Manga panel art: {panel['scene']}.
Visual style: {manga_script.get('style_notes', 'black and white manga style')}.
{panel['visual_notes']}
Style: Clean manga linework, dramatic angles, expressive characters."""

                try:
                    # Generate image
                    image_response = image_model.generate_content(image_prompt)

                    # Extract image data
                    if hasattr(image_response, 'images') and image_response.images:
                        # Convert image to base64
                        img_data = image_response.images[0]
                        images.append({
                            'panel_number': panel['panel_number'],
                            'image_data': base64.b64encode(img_data).decode('utf-8'),
                            'prompt': image_prompt
                        })
                    else:
                        # Placeholder if image generation fails
                        images.append({
                            'panel_number': panel['panel_number'],
                            'image_data': None,
                            'prompt': image_prompt,
                            'error': 'Image generation not available'
                        })
                except Exception as img_err:
                    print(f"Image generation error for panel {panel['panel_number']}: {str(img_err)}")
                    images.append({
                        'panel_number': panel['panel_number'],
                        'image_data': None,
                        'prompt': image_prompt,
                        'error': str(img_err)
                    })

        except Exception as model_err:
            print(f"Image model initialization error: {str(model_err)}")
            # Continue without images
            for panel in manga_script.get('panels', []):
                images.append({
                    'panel_number': panel['panel_number'],
                    'image_data': None,
                    'error': 'Image generation not available with this model'
                })

        return jsonify({
            'success': True,
            'script': manga_script,
            'images': images
        })

    except json.JSONDecodeError as je:
        return jsonify({
            'error': f'Failed to parse manga script: {str(je)}',
            'raw_response': script_text
        }), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/test-api-key', methods=['POST'])
def test_api_key():
    """
    Test if the provided API key is valid
    """
    try:
        data = request.json
        api_key = data.get('api_key', '')
        model_name = data.get('model', 'gemini-2.0-flash-exp')

        if not api_key:
            return jsonify({'valid': False, 'error': 'API key is required'}), 400

        # Configure and test the API key
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name)

        # Simple test prompt
        response = model.generate_content("Hello")

        return jsonify({'valid': True, 'message': 'API key is valid'})

    except Exception as e:
        return jsonify({'valid': False, 'error': str(e)}), 400

if __name__ == '__main__':
    # Create static directory if it doesn't exist
    os.makedirs('static', exist_ok=True)
    app.run(debug=True, host='0.0.0.0', port=5000)
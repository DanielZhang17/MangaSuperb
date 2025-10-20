from flask import Flask, request, jsonify, send_from_directory
import google.generativeai as genai
import os
import json
import base64
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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
        model_name = data.get('model', 'gemini-2.5-pro')
        api_key = data.get('api_key', '')

        logger.info(f"=== Manga Generation Request ===")
        logger.info(f"Model: {model_name}")
        logger.info(f"Prompt length: {len(prompt)} characters")

        if not prompt:
            logger.error("No prompt provided")
            return jsonify({'error': 'Prompt is required'}), 400

        if not api_key:
            logger.error("No API key provided")
            return jsonify({'error': 'API key is required'}), 400

        # Configure Gemini API
        genai.configure(api_key=api_key)
        logger.info("API key configured successfully")

        # Generate manga script
        script_model = genai.GenerativeModel(model_name)

        script_prompt = f"""You are a manga scriptwriter. Based on the following idea, create a detailed manga script with:
1. A brief story summary
2. 4-6 panel descriptions with dialogue and scene details
3. Character descriptions
4. Visual style notes that can prompt the image generation model to create fitting manga-style images.

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

        logger.info("Generating manga script...")
        script_response = script_model.generate_content(script_prompt)
        script_text = script_response.text
        logger.info(f"Script generated successfully. Length: {len(script_text)} characters")

        # Extract JSON from response (handle markdown code blocks)
        if '```json' in script_text:
            script_text = script_text.split('```json')[1].split('```')[0].strip()
        elif '```' in script_text:
            script_text = script_text.split('```')[1].split('```')[0].strip()

        manga_script = json.loads(script_text)
        logger.info(f"Script parsed successfully. Title: {manga_script.get('title', 'N/A')}")
        logger.info(f"Number of panels: {len(manga_script.get('panels', []))}")

        # Create images directory if it doesn't exist
        images_dir = os.path.join('static', 'generated_images')
        os.makedirs(images_dir, exist_ok=True)
        logger.info(f"Images directory ready: {images_dir}")

        # Generate images for each panel using Gemini image generation model
        images = []
        image_model_name = 'gemini-2.5-flash-image'

        try:
            # Use GenerativeModel with image generation capabilities
            logger.info(f"Initializing image generation model: {image_model_name}")
            image_model = genai.GenerativeModel(image_model_name)
            logger.info("Image model initialized successfully")

            for panel in manga_script.get('panels', []):
                panel_num = panel['panel_number']
                logger.info(f"--- Generating image for panel {panel_num} ---")

                image_prompt = f"""Generate a manga panel image:
Scene: {panel['scene']}
Visual style: {manga_script.get('style_notes', 'black and white manga style')}
Details: {panel['visual_notes']}
Style: Clean manga linework, dramatic angles, expressive characters."""

                logger.info(f"Panel {panel_num} prompt: {image_prompt[:100]}...")

                try:
                    # Generate image using the model
                    logger.info(f"Calling generate_content for panel {panel_num}...")
                    result = image_model.generate_content(image_prompt)
                    logger.info(f"Panel {panel_num}: API call completed")

                    # Log response structure for debugging
                    logger.info(f"Panel {panel_num}: Response has {len(result.candidates)} candidate(s)")

                    # Extract image data from response parts
                    img_base64 = None
                    if result.candidates and len(result.candidates) > 0:
                        candidate = result.candidates[0]
                        logger.info(f"Panel {panel_num}: Candidate finish_reason: {candidate.finish_reason}")

                        if candidate.content and candidate.content.parts:
                            logger.info(f"Panel {panel_num}: Found {len(candidate.content.parts)} part(s)")

                            for idx, part in enumerate(candidate.content.parts):
                                logger.info(f"Panel {panel_num}: Part {idx} - has inline_data: {hasattr(part, 'inline_data')}")

                                # Check if this part contains image data
                                if hasattr(part, 'inline_data') and part.inline_data:
                                    logger.info(f"Panel {panel_num}: Found inline_data with mime_type: {part.inline_data.mime_type}")

                                    # Get image data
                                    image_data = part.inline_data.data
                                    logger.info(f"Panel {panel_num}: Image data type: {type(image_data)}")

                                    # Check if data is already base64 string or raw bytes
                                    if isinstance(image_data, str):
                                        logger.info(f"Panel {panel_num}: Data is string (likely already base64)")
                                        img_base64 = image_data
                                        # Decode for file saving
                                        try:
                                            file_data = base64.b64decode(image_data)
                                            logger.info(f"Panel {panel_num}: Decoded size: {len(file_data)} bytes")
                                        except Exception as decode_err:
                                            logger.error(f"Panel {panel_num}: Failed to decode base64: {decode_err}")
                                            file_data = image_data.encode('utf-8')
                                    else:
                                        logger.info(f"Panel {panel_num}: Data is bytes, size: {len(image_data)} bytes")
                                        img_base64 = base64.b64encode(image_data).decode('utf-8')
                                        file_data = image_data

                                    # Save to file
                                    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                                    filename = f"panel_{panel_num}_{timestamp}.png"
                                    filepath = os.path.join(images_dir, filename)

                                    with open(filepath, 'wb') as f:
                                        f.write(file_data)
                                    logger.info(f"Panel {panel_num}: Image saved to {filepath} ({len(file_data)} bytes)")

                                    break
                                elif hasattr(part, 'mime_type') and 'image' in str(part.mime_type):
                                    logger.info(f"Panel {panel_num}: Part has image mime_type: {part.mime_type}")
                                    # Alternative way to get image data
                                    if hasattr(part, 'data'):
                                        image_data = part.data
                                        logger.info(f"Panel {panel_num}: Image data type: {type(image_data)}")

                                        # Check if data is already base64 string or raw bytes
                                        if isinstance(image_data, str):
                                            logger.info(f"Panel {panel_num}: Data is string (likely already base64)")
                                            img_base64 = image_data
                                            # Decode for file saving
                                            try:
                                                file_data = base64.b64decode(image_data)
                                                logger.info(f"Panel {panel_num}: Decoded size: {len(file_data)} bytes")
                                            except Exception as decode_err:
                                                logger.error(f"Panel {panel_num}: Failed to decode base64: {decode_err}")
                                                file_data = image_data.encode('utf-8')
                                        else:
                                            logger.info(f"Panel {panel_num}: Data is bytes, size: {len(image_data)} bytes")
                                            img_base64 = base64.b64encode(image_data).decode('utf-8')
                                            file_data = image_data

                                        # Save to file
                                        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                                        filename = f"panel_{panel_num}_{timestamp}.png"
                                        filepath = os.path.join(images_dir, filename)

                                        with open(filepath, 'wb') as f:
                                            f.write(file_data)
                                        logger.info(f"Panel {panel_num}: Image saved to {filepath} ({len(file_data)} bytes)")

                                        break
                                else:
                                    # Log part contents for debugging
                                    logger.info(f"Panel {panel_num}: Part {idx} - text content: {hasattr(part, 'text')}")
                                    if hasattr(part, 'text') and part.text:
                                        logger.info(f"Panel {panel_num}: Part {idx} text preview: {part.text[:100]}")
                        else:
                            logger.warning(f"Panel {panel_num}: No content or parts in candidate")

                    if img_base64:
                        logger.info(f"Panel {panel_num}: Image generation successful")
                        images.append({
                            'panel_number': panel_num,
                            'image_url': f"/static/generated_images/{filename}",
                            'prompt': image_prompt
                        })
                    else:
                        logger.warning(f"Panel {panel_num}: No image data found in response")
                        images.append({
                            'panel_number': panel_num,
                            'image_data': None,
                            'prompt': image_prompt,
                            'error': 'No image data in response'
                        })
                except Exception as img_err:
                    logger.error(f"Panel {panel_num}: Image generation error: {type(img_err).__name__}: {str(img_err)}")
                    logger.exception(f"Full traceback for panel {panel_num}:")
                    images.append({
                        'panel_number': panel_num,
                        'image_data': None,
                        'prompt': image_prompt,
                        'error': str(img_err)
                    })

        except Exception as model_err:
            logger.error(f"Image model initialization error: {type(model_err).__name__}: {str(model_err)}")
            logger.exception("Full traceback for image model error:")
            # Continue without images
            for panel in manga_script.get('panels', []):
                images.append({
                    'panel_number': panel['panel_number'],
                    'image_data': None,
                    'error': f'Image generation not available: {str(model_err)}'
                })

        logger.info(f"=== Generation Complete ===")
        logger.info(f"Script panels: {len(manga_script.get('panels', []))}")
        logger.info(f"Images generated: {len([img for img in images if img.get('image_data')])}")
        logger.info(f"Images failed: {len([img for img in images if not img.get('image_data')])}")

        return jsonify({
            'success': True,
            'script': manga_script,
            'images': images
        })

    except json.JSONDecodeError as je:
        logger.error(f"JSON decode error: {str(je)}")
        return jsonify({
            'error': f'Failed to parse manga script: {str(je)}',
            'raw_response': script_text
        }), 500
    except Exception as e:
        logger.error(f"Unexpected error: {type(e).__name__}: {str(e)}")
        logger.exception("Full traceback:")
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
        model.generate_content("Hello")

        return jsonify({'valid': True, 'message': 'API key is valid'})

    except Exception as e:
        return jsonify({'valid': False, 'error': str(e)}), 400

if __name__ == '__main__':
    # Create static directory if it doesn't exist
    os.makedirs('static', exist_ok=True)
    app.run(debug=True, host='0.0.0.0', port=5000)
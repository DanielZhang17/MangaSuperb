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

@app.route('/api/generate-script', methods=['POST'])
def generate_script():
    """
    Generate manga script only (no images)
    """
    try:
        data = request.json
        prompt = data.get('prompt', '')
        model_name = data.get('model', 'gemini-2.5-pro')
        api_key = data.get('api_key', '')

        logger.info(f"=== Script Generation Request ===")
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

        script_prompt = f"""You are a professional manga scriptwriter. Based on the following idea, create a detailed manga script with:
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

        return jsonify({
            'success': True,
            'script': manga_script
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

@app.route('/api/generate-image', methods=['POST'])
def generate_image():
    """
    Generate a single multi-panel manga page image from a script
    """
    try:
        data = request.json
        script = data.get('script', {})
        model_name = data.get('model', 'gemini-2.5-pro')
        api_key = data.get('api_key', '')

        logger.info(f"=== Image Generation Request ===")
        logger.info(f"Model: {model_name}")
        logger.info(f"Script title: {script.get('title', 'N/A')}")
        logger.info(f"Number of panels: {len(script.get('panels', []))}")

        if not script or not script.get('panels'):
            logger.error("No script or panels provided")
            return jsonify({'error': 'Valid script with panels is required'}), 400

        if not api_key:
            logger.error("No API key provided")
            return jsonify({'error': 'API key is required'}), 400

        # Configure Gemini API
        genai.configure(api_key=api_key)

        # Create images directory if it doesn't exist
        images_dir = os.path.join('static', 'generated_images')
        os.makedirs(images_dir, exist_ok=True)
        logger.info(f"Images directory ready: {images_dir}")

        # Generate single multi-panel manga page image using Gemini image generation model
        image_model_name = 'gemini-2.5-flash-image'
        ##image_model_name = 'imagen-4.0-generate-001'


        try:
            # Build comprehensive prompt for multi-panel page
            logger.info(f"Initializing image generation model: {image_model_name}")
            image_model = genai.GenerativeModel(image_model_name)
            logger.info("Image model initialized successfully")

            # Build detailed prompt for complete manga page
            panels_description = []
            for panel in script.get('panels', []):
                panel_desc = f"Panel {panel['panel_number']}: Scene - {panel['scene']}. "
                if panel.get('dialogue'):
                    panel_desc += f"Dialogue - {panel['dialogue']}. "
                panel_desc += f"Visual details - {panel['visual_notes']}"
                panels_description.append(panel_desc)

            num_panels = len(script.get('panels', []))

            # Determine layout based on panel count
            if num_panels <= 3:
                layout_instruction = "Arrange the panels in a vertical single-column layout, reading top to bottom."
            elif num_panels == 4:
                layout_instruction = "Arrange the panels in a 2x2 grid layout, reading order: top-left, top-right, bottom-left, bottom-right."
            elif num_panels == 5:
                layout_instruction = "Arrange the panels in a mixed layout: 2 panels on top row, 3 panels on bottom row, reading left to right, top to bottom."
            else:  # 6 or more
                layout_instruction = "Arrange the panels in a 2x3 grid layout (2 columns, 3 rows), reading order: top to bottom, left to right in manga style."

            image_prompt = f"""Generate a complete manga page with {num_panels} panels arranged as follows:

{layout_instruction}

Title: {script.get('title', 'Untitled')}
Overall Style: {script.get('style_notes', 'black and white manga style with clean linework, dramatic angles, and expressive characters')}

Panel Details:
{chr(10).join(panels_description)}

Requirements:
- Draw ALL {num_panels} panels on a single manga page
- Use classic manga/anime art style with clean black and white linework
- Include panel borders to clearly separate each scene
- Add dramatic angles and expressive character emotions
- Maintain visual consistency across all panels
- Leave space for dialogue text if needed
- Follow traditional manga composition and layout principles"""

            logger.info(f"Generating multi-panel manga page...")
            logger.info(f"Prompt preview: {image_prompt[:200]}...")

            result = image_model.generate_content(image_prompt)
            logger.info(f"API call completed")

            # Log response structure for debugging
            logger.info(f"Response has {len(result.candidates)} candidate(s)")

            # Extract image data from response parts
            img_base64 = None
            filename = None

            if result.candidates and len(result.candidates) > 0:
                candidate = result.candidates[0]
                logger.info(f"Candidate finish_reason: {candidate.finish_reason}")

                if candidate.content and candidate.content.parts:
                    logger.info(f"Found {len(candidate.content.parts)} part(s)")

                    for part in candidate.content.parts:
                        # Check if this part contains image data
                        if hasattr(part, 'inline_data') and part.inline_data:
                            logger.info(f"Found inline_data with mime_type: {part.inline_data.mime_type}")

                            # Get image data
                            image_data = part.inline_data.data
                            logger.info(f"Image data type: {type(image_data)}")

                            # Check if data is already base64 string or raw bytes
                            if isinstance(image_data, str):
                                logger.info(f"Data is string (likely already base64)")
                                img_base64 = image_data
                                # Decode for file saving
                                try:
                                    file_data = base64.b64decode(image_data)
                                    logger.info(f"Decoded size: {len(file_data)} bytes")
                                except Exception as decode_err:
                                    logger.error(f"Failed to decode base64: {decode_err}")
                                    file_data = image_data.encode('utf-8')
                            else:
                                logger.info(f"Data is bytes, size: {len(image_data)} bytes")
                                img_base64 = base64.b64encode(image_data).decode('utf-8')
                                file_data = image_data

                            # Save to file
                            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                            filename = f"manga_page_{timestamp}.png"
                            filepath = os.path.join(images_dir, filename)

                            with open(filepath, 'wb') as f:
                                f.write(file_data)
                            logger.info(f"Multi-panel image saved to {filepath} ({len(file_data)} bytes)")

                            break

            if img_base64 and filename:
                logger.info(f"Multi-panel page generation successful")
                image_result = {
                    'image_url': f"/static/generated_images/{filename}",
                    'prompt': image_prompt
                }
            else:
                logger.warning(f"No image data found in response")
                image_result = {
                    'image_url': None,
                    'error': 'No image data in response'
                }

        except Exception as img_err:
            logger.error(f"Image generation error: {type(img_err).__name__}: {str(img_err)}")
            logger.exception(f"Full traceback:")
            image_result = {
                'image_url': None,
                'error': str(img_err)
            }

        logger.info(f"=== Generation Complete ===")

        return jsonify({
            'success': True,
            'image': image_result
        })

    except Exception as e:
        logger.error(f"Unexpected error: {type(e).__name__}: {str(e)}")
        logger.exception("Full traceback:")
        return jsonify({'error': str(e)}), 500

@app.route('/api/generate-manga', methods=['POST'])
def generate_manga():
    """
    Legacy endpoint: Generate manga script and images in one call (for backward compatibility)
    """
    try:
        data = request.json
        model_name = data.get('model', 'gemini-2.5-pro')
        api_key = data.get('api_key', '')

        # First generate script
        script_response = generate_script()
        if script_response[1] != 200:
            return script_response

        script_data = json.loads(script_response[0].get_data(as_text=True))

        # Then generate image
        data_with_script = {
            'script': script_data['script'],
            'model': model_name,
            'api_key': api_key
        }

        # Temporarily update request data
        from flask import request as flask_request
        flask_request.json = data_with_script

        image_response = generate_image()

        return image_response

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
# MangaSuperb - AI Manga Generator

An AI-powered manga generation tool that uses Google's Gemini API to create manga scripts and generate panel images.

## Features

- 🎨 Generate complete manga scripts with multiple panels
- 🖼️ AI-generated manga panel images (when available)
- 💾 Local browser storage for API keys and generated content
- 🔄 Regenerate stories on demand
- ⬇️ Download individual or all panel images
- 🔑 Support for multiple Gemini models

## Setup

### Prerequisites

- Python 3.8 or higher
- Google Gemini API key (get one at [Google AI Studio](https://makersuite.google.com/app/apikey))

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd MangaSuperb
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the application:
```bash
python app.py
```

4. Open your browser and navigate to:
```
http://localhost:5000
```

## Usage

1. **Configure API Key**: Enter your Google Gemini API key in the header section and click "Save Configuration"
2. **Select Model**: Choose between Gemini 2.0 Flash (Experimental) or Gemini 1.5 Pro
3. **Enter Story Idea**: Type your manga story concept in the text box at the bottom
4. **Generate**: Click "Generate Manga" or press Enter to create your manga
5. **Download**: Download individual panels or all images at once

## Supported Models

- **Gemini 2.0 Flash (Experimental)**: Fast, experimental model
- **Gemini 1.5 Pro**: Production-ready model with high quality output

## Data Storage

All data is stored locally in your browser:
- API keys (localStorage)
- Model preferences (localStorage)
- Generated manga content (localStorage)

No data is sent to any external servers except Google's Gemini API.

## Development

### Project Structure

```
MangaSuperb/
├── app.py              # Flask backend
├── static/
│   └── index.html      # Frontend UI
├── requirements.txt    # Python dependencies
├── README.md          # This file
└── CLAUDE.md          # Development guide
```

## License

Apache License 2.0
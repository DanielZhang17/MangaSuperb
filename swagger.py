"""
Swagger configuration and endpoint documentation definitions.
"""
from flasgger import Swagger

# Base template describing the API
SWAGGER_TEMPLATE = {
    'swagger': '2.0',
    'info': {
        'title': 'MangaSuperb API',
        'description': (
            'Backend endpoints for manga generation, job management, and authentication.'
        ),
        'version': '1.0.0',
    },
    'schemes': ['https', 'http'],
    'basePath': '/',
    'consumes': ['application/json'],
    'produces': ['application/json'],
    'tags': [
        {'name': 'Auth', 'description': 'Session and credential management endpoints.'},
        {'name': 'Characters', 'description': 'Character creation and asset generation.'},
        {'name': 'Scripts', 'description': 'Author and manage story content.'},
        {'name': 'Comics', 'description': 'Comic metadata, style, and asset coordination.'},
        {'name': 'Jobs', 'description': 'Asynchronous generation workflows.'},
    ],
    'securityDefinitions': {
        'sessionCookie': {
            'type': 'apiKey',
            'name': 'session',
            'in': 'cookie',
            'description': 'Flask session cookie established after successful login.',
        }
    },
}


def _rule_filter(_rule):
    """Expose all routes in the generated spec."""
    return True


def _model_filter(_tag):
    """Expose all models in the generated spec."""
    return True


# Flasgger configuration options
SWAGGER_CONFIG = {
    'headers': [],
    'specs': [
        {
            'endpoint': 'apispec_1',
            'route': '/api/docs.json',
            'rule_filter': _rule_filter,
            'model_filter': _model_filter,
        }
    ],
    'static_url_path': '/flasgger_static',
    'swagger_ui': True,
    'specs_route': '/api/docs/',
}


AUTH_REGISTER_DOC = {
    'tags': ['Auth'],
    'summary': 'Register a new user',
    'description': 'Creates a user account and starts a logged-in session.',
    'parameters': [
        {
            'name': 'body',
            'in': 'body',
            'required': True,
            'schema': {
                'type': 'object',
                'required': ['username', 'email', 'password'],
                'properties': {
                    'username': {
                        'type': 'string',
                        'minLength': 3,
                        'maxLength': 80,
                        'example': 'artist123',
                    },
                    'email': {
                        'type': 'string',
                        'format': 'email',
                        'maxLength': 255,
                        'example': 'artist123@example.com',
                    },
                    'password': {
                        'type': 'string',
                        'minLength': 8,
                        'example': 'super-secure-pass',
                    },
                },
            },
        }
    ],
    'responses': {
        '201': {
            'description': 'User created',
            'schema': {
                'type': 'object',
                'properties': {
                    'user': {
                        'type': 'object',
                        'properties': {
                            'id': {'type': 'integer'},
                            'username': {'type': 'string'},
                            'email': {'type': 'string', 'format': 'email'},
                            'avatar_index': {'type': 'integer', 'minimum': 1, 'maximum': 4},
                            'created_at': {'type': 'string', 'format': 'date-time'},
                        },
                    }
                },
            },
        },
        '400': {
            'description': 'Validation error',
            'examples': {'application/json': {'error': 'Username is required'}},
        },
        '409': {
            'description': 'Username or email already exists',
            'examples': {'application/json': {'error': 'Username or email already exists'}},
        },
    },
}


AUTH_LOGIN_DOC = {
    'tags': ['Auth'],
    'summary': 'Log in an existing user',
    'description': 'Authenticates credentials and returns session information.',
    'parameters': [
        {
            'name': 'body',
            'in': 'body',
            'required': True,
            'schema': {
                'type': 'object',
                'required': ['password'],
                'anyOf': [
                    {'required': ['email']},
                    {'required': ['username']},
                ],
                'properties': {
                    'email': {
                        'type': 'string',
                        'format': 'email',
                        'example': 'artist123@example.com',
                    },
                    'username': {
                        'type': 'string',
                        'example': 'artist123',
                    },
                    'password': {
                        'type': 'string',
                        'minLength': 8,
                        'example': 'super-secure-pass',
                    },
                },
            },
        }
    ],
    'responses': {
        '200': AUTH_REGISTER_DOC['responses']['201'],
        '400': {
            'description': 'Validation error',
            'examples': {'application/json': {'error': 'Email or username and password are required'}},
        },
        '401': {
            'description': 'Invalid credentials',
            'examples': {'application/json': {'error': 'Invalid credentials'}},
        },
    },
}

AUTH_UPDATE_USERNAME_DOC = {
    'tags': ['Auth'],
    'summary': 'Update username',
    'description': 'Updates the username for the authenticated user.',
    'parameters': [
        {
            'name': 'body',
            'in': 'body',
            'required': True,
            'schema': {
                'type': 'object',
                'required': ['username'],
                'properties': {
                    'username': {
                        'type': 'string',
                        'minLength': 3,
                        'maxLength': 80,
                        'example': 'new-artist-handle',
                    },
                },
            },
        }
    ],
    'responses': {
        '200': AUTH_REGISTER_DOC['responses']['201'],
        '400': {
            'description': 'Validation error',
            'examples': {'application/json': {'error': 'New username must be different'}},
        },
        '401': {
            'description': 'Unauthenticated',
            'examples': {'application/json': {'error': 'Authentication required'}},
        },
        '409': {
            'description': 'Username already exists',
            'examples': {'application/json': {'error': 'Username already exists'}},
        },
    },
    'security': [{'sessionCookie': []}],
}


AUTH_UPDATE_EMAIL_DOC = {
    'tags': ['Auth'],
    'summary': 'Update email address',
    'description': 'Updates the email address for the authenticated user.',
    'parameters': [
        {
            'name': 'body',
            'in': 'body',
            'required': True,
            'schema': {
                'type': 'object',
                'required': ['email'],
                'properties': {
                    'email': {
                        'type': 'string',
                        'format': 'email',
                        'maxLength': 255,
                        'example': 'creator@example.com',
                    },
                },
            },
        }
    ],
    'responses': {
        '200': AUTH_REGISTER_DOC['responses']['201'],
        '400': {
            'description': 'Validation error',
            'examples': {'application/json': {'error': 'New email must be different'}},
        },
        '401': {
            'description': 'Unauthenticated',
            'examples': {'application/json': {'error': 'Authentication required'}},
        },
        '409': {
            'description': 'Email already exists',
            'examples': {'application/json': {'error': 'Email already exists'}},
        },
    },
    'security': [{'sessionCookie': []}],
}


AUTH_UPDATE_PASSWORD_DOC = {
    'tags': ['Auth'],
    'summary': 'Update password',
    'description': 'Changes the password for the authenticated user.',
    'parameters': [
        {
            'name': 'body',
            'in': 'body',
            'required': True,
            'schema': {
                'type': 'object',
                'required': ['current_password', 'new_password'],
                'properties': {
                    'current_password': {
                        'type': 'string',
                        'example': 'old-pass-123',
                    },
                    'new_password': {
                        'type': 'string',
                        'minLength': 8,
                        'example': 'new-super-secure-pass',
                    },
                },
            },
        }
    ],
    'responses': {
        '200': {
            'description': 'Password updated',
            'schema': {
                'type': 'object',
                'properties': {
                    'message': {'type': 'string', 'example': 'Password updated'},
                },
            },
        },
        '400': {
            'description': 'Validation error',
            'examples': {'application/json': {'error': 'Current password is incorrect'}},
        },
        '401': {
            'description': 'Unauthenticated',
            'examples': {'application/json': {'error': 'Authentication required'}},
        },
    },
    'security': [{'sessionCookie': []}],
}


AUTH_ME_DOC = {
    'tags': ['Auth'],
    'summary': 'Fetch the current session',
    'description': 'Returns the authenticated user, or null when not logged in.',
    'responses': {
        '200': {
            'description': 'User session info',
            'schema': {
                'type': 'object',
                'properties': {
                    'user': {
                        'anyOf': [
                            AUTH_REGISTER_DOC['responses']['201']['schema']['properties']['user'],
                            {'type': 'null'},
                        ]
                    }
                },
            },
        }
    },
    'security': [{'sessionCookie': []}],
}


AUTH_LOGOUT_DOC = {
    'tags': ['Auth'],
    'summary': 'Log out the current user',
    'description': 'Clears the active session.',
    'responses': {
        '200': {
            'description': 'Logout succeeded',
            'examples': {'application/json': {'message': 'Logged out'}},
        },
        '401': {
            'description': 'No active session',
            'examples': {'application/json': {'error': 'Authentication required'}},
        },
    },
    'security': [{'sessionCookie': []}],
}


def register_swagger(app):
    """Attach Swagger UI and JSON spec endpoints to the Flask app."""
    return Swagger(app, template=SWAGGER_TEMPLATE, config=SWAGGER_CONFIG)


CHARACTER_CREATE_DOC = {
    'tags': ['Characters'],
    'summary': 'Create a character',
    'description': (
        'Creates a character profile. When reference images are provided, the request enqueues a background job '
        'to generate concept art using the optimized description and references.'
    ),
    'parameters': [
        {
            'name': 'body',
            'in': 'body',
            'required': True,
            'schema': {
                'type': 'object',
                'required': ['name', 'description'],
                'properties': {
                    'name': {'type': 'string', 'example': 'Aiko the Mechanist'},
                    'description': {
                        'type': 'string',
                        'example': 'A brilliant teen engineer with mechanized arms and neon tattoos.'
                    },
                    'optimize': {'type': 'boolean', 'default': False},
                    'api_key': {'type': 'string', 'description': 'Required when optimization or reference images are used.'},
                    'style_prompt': {'type': 'string', 'example': 'Cyberpunk manga aesthetic with bold line work.'},
                    'reference_images': {
                        'type': 'array',
                        'items': {'type': 'string', 'example': 'data:image/png;base64,...'},
                        'description': 'Base64-encoded reference images to guide the generator.'
                    },
                },
            },
        }
    ],
    'responses': {
        '201': {
            'description': 'Character created',
            'schema': {
                'type': 'object',
                'properties': {
                    'character': {
                        'type': 'object',
                        'properties': {
                            'id': {'type': 'integer'},
                            'user_id': {'type': 'integer'},
                            'name': {'type': 'string'},
                            'description': {'type': 'string'},
                            'style_prompt': {'type': ['string', 'null']},
                            'optimized_description': {'type': ['string', 'null']},
                            'image_status': {'type': 'string'},
                            'image_url': {'type': ['string', 'null']},
                            'image_job_id': {'type': ['string', 'null']},
                            'image_error': {'type': ['string', 'null']},
                            'created_at': {'type': ['string', 'null'], 'format': 'date-time'},
                            'updated_at': {'type': ['string', 'null'], 'format': 'date-time'},
                        },
                    },
                    'job_id': {'type': ['string', 'null']}
                },
            },
        },
        '400': {
            'description': 'Validation error',
            'examples': {'application/json': {'error': 'Name is required'}},
        },
        '502': {
            'description': 'Optimization failed',
            'examples': {'application/json': {'error': 'Failed to optimize character description'}},
        },
    },
    'security': [{'sessionCookie': []}],
}

CHARACTER_DETAIL_DOC = {
    'tags': ['Characters'],
    'summary': 'Get character details',
    'description': 'Returns a single character created by the authenticated user.',
    'parameters': [
        {
            'name': 'character_id',
            'in': 'path',
            'required': True,
            'type': 'integer',
        }
    ],
    'responses': {
        '200': {
            'description': 'Character payload',
            'schema': CHARACTER_CREATE_DOC['responses']['201']['schema']['properties']['character'],
        },
        '404': {'description': 'Character not found'},
    },
    'security': [{'sessionCookie': []}],
}

SCRIPT_CREATE_DOC = {
    'tags': ['Scripts'],
    'summary': 'Create a script',
    'description': 'Stores story content for later editing or comic generation.',
    'parameters': [
        {
            'name': 'body',
            'in': 'body',
            'required': True,
            'schema': {
                'type': 'object',
                'required': ['title', 'content'],
                'properties': {
                    'title': {'type': 'string', 'example': 'Episode 1: Awakening'},
                    'content': {'type': 'string', 'example': 'Narrative text or JSON structure of the story.'},
                },
            },
        }
    ],
    'responses': {
        '201': {
            'description': 'Script created',
            'schema': {
                'type': 'object',
                'properties': {
                    'script': {
                        'type': 'object',
                        'properties': {
                            'id': {'type': 'integer'},
                            'user_id': {'type': 'integer'},
                            'title': {'type': 'string'},
                            'content': {'type': 'string'},
                            'created_at': {'type': ['string', 'null'], 'format': 'date-time'},
                            'updated_at': {'type': ['string', 'null'], 'format': 'date-time'},
                        },
                    }
                },
            },
        },
        '400': {'description': 'Validation error'},
    },
    'security': [{'sessionCookie': []}],
}

SCRIPT_LIST_DOC = {
    'tags': ['Scripts'],
    'summary': 'List scripts',
    'description': 'Returns recent scripts authored by the authenticated user.',
    'parameters': [
        {
            'name': 'limit',
            'in': 'query',
            'type': 'integer',
            'default': 50,
            'description': 'Maximum number of scripts to return (1-100).'
        }
    ],
    'responses': {
        '200': {
            'description': 'List of scripts',
            'schema': {
                'type': 'object',
                'properties': {
                    'count': {'type': 'integer'},
                    'scripts': {
                        'type': 'array',
                        'items': SCRIPT_CREATE_DOC['responses']['201']['schema']['properties']['script'],
                    },
                },
            },
        }
    },
    'security': [{'sessionCookie': []}],
}

SCRIPT_DETAIL_DOC = {
    'tags': ['Scripts'],
    'summary': 'Get script details',
    'description': 'Fetches a script by id for the authenticated user.',
    'parameters': [
        {
            'name': 'script_id',
            'in': 'path',
            'required': True,
            'type': 'integer',
        }
    ],
    'responses': {
        '200': {
            'description': 'Script payload',
            'schema': SCRIPT_CREATE_DOC['responses']['201']['schema']['properties']['script'],
        },
        '404': {'description': 'Script not found'},
    },
    'security': [{'sessionCookie': []}],
}

COMIC_CREATE_DOC = {
    'tags': ['Comics'],
    'summary': 'Create a comic with script',
    'description': 'Creates a comic record and a paired script using the provided story, style, and aspect ratio.',
    'parameters': [
        {
            'name': 'body',
            'in': 'body',
            'required': True,
            'schema': {
                'type': 'object',
                'required': ['title', 'story', 'style', 'aspect_ratio'],
                'properties': {
                    'title': {'type': 'string', 'example': 'Neon Knights Issue #1'},
                    'story': {'type': 'string', 'example': 'Full story narrative or JSON payload.'},
                    'style': {'type': 'string', 'example': 'Synthwave neon with bold black line art.'},
                    'aspect_ratio': {
                        'type': 'string',
                        'enum': ['16:9', '9:16', '1:1'],
                        'example': '16:9'
                    },
                },
            },
        }
    ],
    'responses': {
        '201': {
            'description': 'Comic created',
            'schema': {
                'type': 'object',
                'properties': {
                    'comic': {
                        'type': 'object',
                        'properties': {
                            'id': {'type': 'integer'},
                            'title': {'type': 'string'},
                            'status': {'type': 'string'},
                            'style_description': {'type': 'string'},
                            'aspect_ratio': {'type': 'string'},
                            'script_id': {'type': 'integer'},
                            'created_at': {'type': ['string', 'null'], 'format': 'date-time'},
                        },
                    },
                    'script': SCRIPT_CREATE_DOC['responses']['201']['schema']['properties']['script'],
                },
            },
        },
        '400': {'description': 'Validation error'},
        '500': {'description': 'Creation failed'},
    },
    'security': [{'sessionCookie': []}],
}

COMIC_LIST_DOC = {
    'tags': ['Comics'],
    'summary': 'List comics',
    'description': 'Returns recent comics owned by the authenticated user.',
    'responses': {
        '200': {
            'description': 'List of comics',
            'schema': {
                'type': 'object',
                'properties': {
                    'count': {'type': 'integer'},
                    'comics': {
                        'type': 'array',
                        'items': COMIC_CREATE_DOC['responses']['201']['schema']['properties']['comic'],
                    },
                },
            },
        },
        '403': {'description': 'Forbidden when requesting another user'},
    },
    'security': [{'sessionCookie': []}],
}

COMIC_DETAIL_DOC = {
    'tags': ['Comics'],
    'summary': 'Get comic details',
    'description': 'Returns a specific comic including generated pages when available.',
    'parameters': [
        {
            'name': 'comic_id',
            'in': 'path',
            'required': True,
            'type': 'integer',
        }
    ],
    'responses': {
        '200': {
            'description': 'Comic details',
            'schema': COMIC_CREATE_DOC['responses']['201']['schema']['properties']['comic'],
        },
        '404': {'description': 'Comic not found'},
    },
    'security': [{'sessionCookie': []}],
}

JOB_CREATE_DOC = {
    'tags': ['Jobs'],
    'summary': 'Create manga generation job',
    'description': (
        'Generates a manga script immediately and enqueues background image generation using the provided API key.'
    ),
    'parameters': [
        {
            'name': 'body',
            'in': 'body',
            'required': True,
            'schema': {
                'type': 'object',
                'required': ['prompt', 'api_key'],
                'properties': {
                    'prompt': {'type': 'string', 'example': 'Two siblings discover a hidden mech in the forest.'},
                    'model': {'type': 'string', 'example': 'gemini-2.5-pro'},
                    'api_key': {'type': 'string'},
                    'style': {'type': 'string', 'example': 'High-contrast ink with splashy gradients.'},
                    'aspect_ratio': {
                        'type': 'string',
                        'enum': ['16:9', '9:16', '1:1'],
                        'example': '16:9'
                    },
                },
            },
        }
    ],
    'responses': {
        '201': {
            'description': 'Job created',
            'schema': {
                'type': 'object',
                'properties': {
                    'job_id': {'type': 'string'},
                    'comic_id': {'type': 'integer'},
                    'script_id': {'type': 'integer'},
                    'status': {'type': 'string'},
                    'script': SCRIPT_CREATE_DOC['responses']['201']['schema']['properties']['script'],
                },
            },
        },
        '400': {'description': 'Validation error'},
        '500': {'description': 'Unexpected failure'},
    },
    'security': [{'sessionCookie': []}],
}

JOB_STATUS_DOC = {
    'tags': ['Jobs'],
    'summary': 'Get job status',
    'description': 'Fetches current job status and associated comic or character payload.',
    'parameters': [
        {
            'name': 'job_id',
            'in': 'path',
            'required': True,
            'type': 'string',
        }
    ],
    'responses': {
        '200': {
            'description': 'Job status payload',
            'schema': {
                'type': 'object',
                'properties': {
                    'job_id': {'type': 'string'},
                    'rq_status': {'type': 'string'},
                    'comic': COMIC_CREATE_DOC['responses']['201']['schema']['properties']['comic'],
                    'character': {
                        'anyOf': [
                            CHARACTER_CREATE_DOC['responses']['201']['schema']['properties']['character'],
                            {'type': 'null'}
                        ]
                    }
                },
            },
        },
        '404': {'description': 'Job not found'},
    },
}


__all__ = [
    'register_swagger',
    'AUTH_REGISTER_DOC',
    'AUTH_LOGIN_DOC',
    'AUTH_LOGOUT_DOC',
    'AUTH_ME_DOC',
    'AUTH_UPDATE_USERNAME_DOC',
    'AUTH_UPDATE_EMAIL_DOC',
    'AUTH_UPDATE_PASSWORD_DOC',
    'CHARACTER_CREATE_DOC',
    'SCRIPT_CREATE_DOC',
    'SCRIPT_LIST_DOC',
    'SCRIPT_DETAIL_DOC',
    'COMIC_CREATE_DOC',
    'COMIC_LIST_DOC',
    'COMIC_DETAIL_DOC',
    'JOB_CREATE_DOC',
    'JOB_STATUS_DOC',
    'CHARACTER_DETAIL_DOC',
]

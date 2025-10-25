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
        'to generate concept art using the optimized description and references. Optimisation uses the backend '
        'Gemini configuration; clients do not supply API keys.'
    ),
    'parameters': [
        {
            'name': 'body',
            'in': 'body',
            'required': True,
            'schema': {
                'type': 'object',
                'required': ['description'],
                'properties': {
                    'name': {
                        'type': 'string',
                        'example': 'Aiko the Mechanist',
                        'default': 'unspecified',
                        'description': 'Optional. If omitted the backend stores `unspecified` until the user renames it.',
                    },
                    'description': {
                        'type': 'string',
                        'example': 'A brilliant teen engineer with mechanized arms and neon tattoos.'
                    },
                    'sex': {
                        'type': 'string',
                        'enum': ['male', 'female', 'non-binary', 'other', 'unspecified'],
                        'default': 'unspecified',
                    },
                    'is_public': {
                        'type': 'boolean',
                        'default': False,
                        'description': 'When true the character is visible to other users.'
                    },
                    'optimize': {'type': 'boolean', 'default': False},
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
                            'sex': {'type': 'string'},
                            'is_public': {'type': 'boolean'},
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

CHARACTER_LIST_DOC = {
    'tags': ['Characters'],
    'summary': 'List characters',
    'description': 'Returns characters owned by the authenticated user plus any that are marked public.',
    'responses': {
        '200': {
            'description': 'List of characters',
            'schema': {
                'type': 'object',
                'properties': {
                    'characters': {
                        'type': 'array',
                        'items': CHARACTER_CREATE_DOC['responses']['201']['schema']['properties']['character'],
                    }
                },
            },
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
    'summary': 'Create background job',
    'description': (
        'Dispatches asynchronous work such as comic generation, story optimisation, character optimisation, or page '
        'rendering. Gemini credentials live in server configuration; clients supply only task parameters.\n\n'
        'Available job types:\n'
        '- `comic_generation` (default): requires `prompt`; optional `style`, `aspect_ratio`, and `characters`.\n'
        '- `story_optimization`: requires `comic_id`; re-runs Gemini script polish for an existing comic.\n'
        '- `character_optimization`: requires `character_id`; optional `description` override.\n'
        '- `page_render`: requires `comic_id` and `page_number`; re-renders a single comic page.'
    ),
    'parameters': [
        {
            'name': 'body',
            'in': 'body',
            'required': True,
            'schema': {
                'type': 'object',
                'properties': {
                    'job_type': {
                        'type': 'string',
                        'enum': [
                            'comic_generation',
                            'story_optimization',
                            'character_optimization',
                            'page_render',
                        ],
                        'default': 'comic_generation',
                        'description': 'Selects the queue workflow to run. See description for required fields per type.',
                    },
                    'prompt': {
                        'type': 'string',
                        'example': 'Two siblings discover a hidden mech in the forest.',
                        'description': 'Required when `job_type` is `comic_generation`; ignored for other job types.',
                    },
                    'style': {
                        'type': 'string',
                        'example': 'High-contrast ink with splashy gradients.',
                        'description': 'Optional style direction for `comic_generation`. Falls back to script defaults.',
                    },
                    'aspect_ratio': {
                        'type': 'string',
                        'enum': ['16:9', '9:16', '1:1'],
                        'example': '16:9',
                        'description': 'Optional for `comic_generation`; validated against supported canvas sizes.',
                    },
                    'characters': {
                        'type': 'array',
                        'items': {'type': 'object'},
                        'description': (
                            'Optional for `comic_generation`. Supply character assignments matching POST /api/characters '
                            'payloads to blend roster context into the generated script.'
                        ),
                    },
                    'comic_id': {
                        'type': 'integer',
                        'example': 42,
                        'description': 'Required for `story_optimization` and `page_render`; must reference an owned comic.',
                    },
                    'page_number': {
                        'type': 'integer',
                        'example': 1,
                        'description': 'Required for `page_render`; 1-indexed page number to regenerate.',
                    },
                    'character_id': {
                        'type': 'integer',
                        'example': 7,
                        'description': 'Required for `character_optimization`; must reference an owned character.',
                    },
                    'description': {
                        'type': 'string',
                        'description': (
                            'Optional override copy when optimising a character. When omitted, the stored description is used.'
                        ),
                    },
                },
                'oneOf': [
                    {
                        'description': 'Comic generation (default)',
                        'required': ['prompt'],
                        'properties': {'job_type': {'enum': ['comic_generation']}},
                    },
                    {
                        'description': 'Story optimisation',
                        'required': ['comic_id'],
                        'properties': {'job_type': {'enum': ['story_optimization']}},
                    },
                    {
                        'description': 'Character optimisation',
                        'required': ['character_id'],
                        'properties': {'job_type': {'enum': ['character_optimization']}},
                    },
                    {
                        'description': 'Page render',
                        'required': ['comic_id', 'page_number'],
                        'properties': {'job_type': {'enum': ['page_render']}},
                    },
                ],
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
        '202': {
            'description': 'Job accepted for processing',
            'schema': {
                'type': 'object',
                'properties': {
                    'job_id': {'type': 'string'},
                    'character_id': {'type': 'integer'},
                    'comic': COMIC_CREATE_DOC['responses']['201']['schema']['properties']['comic'],
                    'stage_jobs': {
                        'type': 'object',
                        'properties': {
                            'outline_job_id': {'type': 'string'},
                            'shot_job_id': {'type': 'string'},
                        },
                    },
                },
            },
        },
        '400': {'description': 'Validation error'},
        '404': {'description': 'Target resource not found'},
        '503': {'description': 'Background queue not available'},
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
                    },
                    'worker_snapshot': {
                        'type': 'object',
                        'properties': {
                            'status': {'type': 'string', 'example': 'idle'},
                            'active': {'type': 'integer', 'example': 0},
                            'workers': {
                                'type': 'array',
                                'items': {'type': 'string'},
                                'example': ['manga-worker-1234'],
                            },
                            'queued': {'type': 'integer', 'example': 3},
                            'deferred': {'type': 'integer', 'example': 2},
                            'scheduled': {'type': 'integer', 'example': 0},
                            'failed': {'type': 'integer', 'example': 0},
                        },
                    },
                    'warning': {
                        'type': 'string',
                        'example': 'No active RQ workers detected; job will remain queued.',
                    },
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
    'CHARACTER_LIST_DOC',
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

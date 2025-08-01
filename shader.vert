#version 300 es

in vec3 a_position;
in vec2 a_uv;

out vec2 v_uv;

// No mesh data, because the raymarcher works on the fragment shader.
void main() {
	gl_Position = vec4(a_position, 1.0);
	v_uv = a_uv;
}

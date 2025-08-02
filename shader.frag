#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;


uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat4 u_modelMatrix;

uniform int u_fractalType;
uniform float u_power;
uniform float iTime;

// Constants for raymarcher
#define MAX_STEPS 256
#define MAX_DISTANCE 700.0
#define SURFACE_DIST 0.0005

#define MAT_FRACTAL 1
#define MAT_OCEAN 2

/**
* mandelbulb sdf from: http://blog.hvidtfeldts.net/index.php/2011/09/distance-estimated-3d-fractals-v-the-mandelbulb-different-de-approximations/
* @param p The 3d position
*/
float mandelbulbSDF(vec3 p) {
    const int ITERATIONS = 200;
    const float BAILOUT = 2.0;
    float POWER = u_power;

    vec3 z = p;
    float dr = 1.0;
    float r = 0.0;

    for (int i = 0; i < ITERATIONS; i++) {
        r = length(z);
        if (r > BAILOUT) break;

        // Spherical coordinates
        float theta = acos(z.z / r);
        float phi = atan(z.y, z.x);
        float zr = pow(r, POWER);

        dr = pow(r, POWER - 1.0) * POWER * dr + 1.0;

        // Scale and rotate
        float sinTheta = sin(theta * POWER);
        float cosTheta = cos(theta * POWER);
        float sinPhi = sin(phi * POWER);
        float cosPhi = cos(phi * POWER);

        z = zr * vec3(
            sinTheta * cosPhi,
            sinTheta * sinPhi,
            cosTheta
        ) + p;
    }

    return 0.5 * log(r) * r / dr;
}

/**
* @param p The 3d position
* @param c Julia constant
* @param power Exponent for each iteration
*/
float juliaSDF(vec3 p, vec3 c, float power) {
    const int ITERATIONS = 8;
    const float BAILOUT = 4.0;

    vec3 z = p;
    float dr = 1.0;
    float r = 0.0;

    for (int i = 0; i < ITERATIONS; i++) {
        r = length(z);
        if (r > BAILOUT) break;

        float theta = acos(z.z / r);
        float phi = atan(z.y, z.x);
        float zr = pow(r, power);

        dr = pow(r, power - 1.0) * power * dr + 1.0;

        z = zr * vec3(
            sin(theta * power) * cos(phi * power),
            sin(theta * power) * sin(phi * power),
            cos(theta * power)
        ) + c;
    }

    return 0.5 * log(r) * r / dr;
}

/**
* Ocean SDF
* function(direction * scaled frequency + speed) * hight
* 
* @param p The 3d position
* @return Distance to the ocean surface. -1.5 is the height of the ocean. waveHeight is the actual height of the wave.
*/
float ocean(vec3 p) {
    float wave1 = sin(p.x * 0.4 + iTime * 1.0) * 0.15;
    float wave2 = cos(p.z * 0.6 + iTime * 1.2) * 0.12;
    float wave3 = sin((p.x + p.z) * 0.8 + iTime * 1.5) * 0.08;
    float wave4 = cos((p.x * 1.5 - p.z) * 0.3 + iTime * 0.9) * 0.05;

    float waveHeight = wave1 + wave2 + wave3 + wave4;

    return p.y - (-1.5 + waveHeight);
}

/**
* Returns the smallest disance to the scene
*/
float sceneSDF(vec3 p, out int materialID) {
    float dFractal;
    if (u_fractalType == 0) {
        dFractal = mandelbulbSDF(p);
    } else {
        vec3 juliaC = vec3(0.355, 0.355, 0.355);
        dFractal = juliaSDF(p, juliaC, u_power);
    }

    // Distance to ocean surface
    float dOcean = ocean(p);

    // return distance from nearest object. Eather ocean or fractal.
    // sets the correstponding material id.
    if (dFractal < dOcean) {
        materialID = MAT_FRACTAL;
        return dFractal;
    } else {
        materialID = MAT_OCEAN;
        return dOcean;
    }
}

/**
* Raymarching function
* @param ro The ray origin
* @param rd The ay direction
* @param steps How many steps were made
* @param materialID Which material was hit
*/
float rayMarch(vec3 ro, vec3 rd, out int steps, out int materialID) {
    float totalDist = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * totalDist;
        float distance = sceneSDF(p, materialID);   // distance to next object
        if (distance < SURFACE_DIST) {
            steps = i;
            return totalDist;
        }
        if (totalDist > MAX_DISTANCE) break;    // exit when distance is to large
        totalDist += distance;  // march ray
    }
    steps = MAX_STEPS;  // if no object was hit
    materialID = -1;
    return -1.0;
}

/**
* @param uv screen corrdinates
*/
vec3 getRayDirection(vec2 uv, mat4 invProj, mat4 invView) {
    vec4 clip = vec4(uv * 2.0 - 1.0, -1.0, 1.0);
    vec4 eye = invProj * clip;
    eye = vec4(eye.xy, -1.0, 0.0);
    vec4 world = invView * eye;
    return normalize(world.xyz);
}

/**
* Only returns distance to scene, without material.
*/
float sceneOnlyDistance(vec3 p) {
    int unusedMaterialID;
    return sceneSDF(p, unusedMaterialID);
}

/**
* calculates the normal vector at @param p
*/
vec3 getNormal(vec3 p) {
    float d = sceneOnlyDistance(p);
    vec2 e = vec2(0.001, 0.0);
    vec3 n = d - vec3(
        sceneOnlyDistance(p - e.xyy),
        sceneOnlyDistance(p - e.yxy),
        sceneOnlyDistance(p - e.yyx)
    );
    return normalize(n);
}

void main() {
    mat4 invProj = inverse(u_projectionMatrix);
    mat4 invView = inverse(u_viewMatrix);

    vec3 camPos = vec3(inverse(u_viewMatrix)[3]);
    vec3 rayDir = getRayDirection(v_uv, invProj, invView);

    vec3 skyColorTop = vec3(0.05, 0.05, 0.2);
    vec3 skyColorBottom = vec3(0.29f, 0.2f, 1.0f);

    int steps;
    int materialID;
    float dist = rayMarch(camPos, rayDir, steps, materialID);

    if (dist > 0.0) {
	    vec3 hitPos = camPos + rayDir * dist;
	    vec3 normal = getNormal(hitPos);

	    vec3 lightDir = normalize(vec3(0.6, 0.7, 0.4));
	    float diff = clamp(dot(normal, lightDir), 0.0, 1.0);

        vec3 baseColor;

        if (materialID == MAT_FRACTAL) {
            // Gradient based on the needed steps
            vec3 col1 = vec3(0.05, 0.0, 0.1);
            vec3 col2 = vec3(0.1, 0.3, 0.25);
            vec3 col3 = vec3(0.3, 0.5, 0.8);
            float t = float(steps) / float(MAX_STEPS);
            baseColor = col1 + t * (col2 - col1) + t * t * (col3 - col2);

            vec3 litColor = baseColor * (0.3 + 1.0 * diff);
            litColor = litColor / (litColor + vec3(1.0));
            litColor = pow(litColor, vec3(1.0 / 2.2));
            outColor = vec4(litColor, 1.0);

        } else if (materialID == MAT_OCEAN) {
            vec3 normal = getNormal(hitPos);
            vec3 lightDir = normalize(vec3(0.6, 0.7, 0.4));
            float diff = clamp(dot(normal, lightDir), 0.0, 1.0);

            float fresnel = pow(1.0 - dot(normal, -rayDir), 3.0);

            vec3 deepWater = vec3(0.0, 0.1, 0.2);
            vec3 shallow = vec3(0.1, 0.4, 0.5);

            vec3 reflectedSky = mix(skyColorBottom, skyColorTop, rayDir.y * 0.5 + 0.5);
            vec3 waterColor = mix(shallow, deepWater, hitPos.y + 1.5);

            vec3 baseColor = mix(waterColor, reflectedSky, fresnel);

            vec3 litColor = baseColor * (0.3 + diff * 0.7);

            litColor = litColor / (litColor + vec3(1.0));

            outColor = vec4(pow(litColor, vec3(1.0 / 2.2)), 1.0);
        }
    } else {
        // If no object got hit
	    // background
        float sunGradient = clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 skyColor = mix(skyColorBottom, skyColorTop, pow(sunGradient, 1.5));

        // Sun and glow in background
        float sunGlow = exp(-pow(rayDir.y + 0.2, 2.0) * 20.0);
        skyColor += sunGlow * vec3(1.0, 0.6, 0.3);

        outColor = vec4(skyColor, 1.0);
    }
}

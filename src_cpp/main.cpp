// ============================================================================
//  CS 1.5 Whisk3D-Core Native Runtime (Desktop & WebGL/Emscripten)
//  Uses Whisk3D Core: w3dEngine, VisBsp, MundoBsp, CameraBase, w3dTexture,
//  W3dAudio, math/Vector3, math/Quaternion, math/Matrix4.
// ============================================================================
#define SDL_MAIN_HANDLED
#include <SDL2/SDL.h>
#include "graphics/w3dGraphics.h"
#include "graphics/w3dTexture.h"
#include "objects/VisBsp.h"
#include "objects/MundoBsp.h"
#include "objects/CameraBase.h"
#include "audio/W3dAudio.h"
#include "base/w3dlog.h"

#ifdef __EMSCRIPTEN__
    #include <emscripten.h>
    #include <emscripten/html5.h>
#endif

#include <math.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <fstream>

namespace gfx = w3dEngine;

static SDL_Window* g_win = 0;
static bool g_run = true;
static VisBsp g_bsp;
static MundoBsp g_mundo;
static CameraBase g_cam;
static float g_yaw = 0.0f, g_pitch = 0.0f;
static Vector3 g_pos(0.0f, 2.0f, 0.0f);
static Vector3 g_vel(0.0f, 0.0f, 0.0f);
static bool g_onGround = false;
static std::string g_assetRoot = "../assets/";

static bool LoadFileBytes(const std::string& path, std::vector<unsigned char>& out) {
    std::ifstream f(path.c_str(), std::ios::binary | std::ios::ate);
    if (!f) return false;
    size_t sz = (size_t)f.tellg();
    f.seekg(0);
    out.resize(sz);
    return f.read((char*)&out[0], sz).good();
}

static bool LoadCSMap(const std::string& mapName) {
    std::vector<unsigned char> bytes;
    std::string bspPath = g_assetRoot + "maps/" + mapName + ".w3dbsp";
    if (!LoadFileBytes(bspPath, bytes)) {
        w3dLogf("No se pudo abrir %s", bspPath.c_str());
        return false;
    }
    std::string err;
    if (!g_bsp.Cargar(&bytes[0], bytes.size(), &err)) {
        w3dLogf("Error VisBsp: %s", err.c_str());
        return false;
    }
    if (!g_mundo.Cargar(&bytes[0], bytes.size(), g_bsp.geomOff, g_bsp, &err, true)) {
        w3dLogf("Error MundoBsp: %s", err.c_str());
        return false;
    }
    // Load map textures & lightmap via w3dEngine::LoadTexture
    for (size_t i = 0; i < g_mundo.materiales.size(); i++) {
        MundoBsp::Material& m = g_mundo.materiales[i];
        std::string texName = m.textura;
        if (texName.compare(0, 9, "texturas/") == 0) texName = texName.substr(9);
        std::string texPath = g_assetRoot + "textures/" + texName;
        unsigned int tid = 0;
        if (gfx::LoadTexture(texPath.c_str(), tid)) m.idTex = tid;
        std::string lmPath = g_assetRoot + "maps/" + mapName + "_lm.png";
        unsigned int lid = 0;
        if (gfx::LoadTexture(lmPath.c_str(), lid)) m.idLm = lid;
    }
    w3dLogf("CS1.5 Map %s loaded: %d mats, %d faces, %d clusters",
            mapName.c_str(), (int)g_mundo.materiales.size(),
            (int)g_mundo.caras.size(), g_bsp.nClusters);
    return true;
}

static void StepMovement(float dt) {
    const Uint8* ks = SDL_GetKeyboardState(NULL);
    float fwd = 0.0f, side = 0.0f;
    if (ks[SDL_SCANCODE_W]) fwd += 1.0f;
    if (ks[SDL_SCANCODE_S]) fwd -= 1.0f;
    if (ks[SDL_SCANCODE_D]) side += 1.0f;
    if (ks[SDL_SCANCODE_A]) side -= 1.0f;

    float rad = g_yaw * 3.14159265f / 180.0f;
    float fx = sinf(rad), fz = -cosf(rad);
    float rx = cosf(rad), rz = sinf(rad);
    float wx = fx * fwd + rx * side;
    float wz = fz * fwd + rz * side;
    float wlen = sqrtf(wx * wx + wz * wz);
    float maxSpd = ks[SDL_SCANCODE_LSHIFT] ? 3.3f : 6.35f; // 250 u/s * SCALE
    float wishSpd = 0.0f;
    if (wlen > 0.001f) { wx /= wlen; wz /= wlen; wishSpd = maxSpd; }

    // GoldSrc friction + accelerate / airaccelerate (sv_airaccelerate 10, 30u cap)
    if (g_onGround) {
        float spd = sqrtf(g_vel.x * g_vel.x + g_vel.z * g_vel.z);
        if (spd > 0.001f) {
            float ctrl = spd < 1.9f ? 1.9f : spd;
            float ns = spd - ctrl * 4.0f * dt;
            if (ns < 0.0f) ns = 0.0f;
            g_vel.x *= ns / spd; g_vel.z *= ns / spd;
        }
        float cur = g_vel.x * wx + g_vel.z * wz;
        float add = wishSpd - cur;
        if (add > 0.0f) {
            float acc = 5.0f * dt * wishSpd;
            if (acc > add) acc = add;
            g_vel.x += acc * wx; g_vel.z += acc * wz;
        }
    } else {
        float wspd = wishSpd > 0.762f ? 0.762f : wishSpd; // 30 u/s air cap -> bhop!
        float cur = g_vel.x * wx + g_vel.z * wz;
        float add = wspd - cur;
        if (add > 0.0f) {
            float acc = 10.0f * wishSpd * dt;
            if (acc > add) acc = add;
            g_vel.x += acc * wx; g_vel.z += acc * wz;
        }
    }

    if (g_onGround && ks[SDL_SCANCODE_SPACE]) {
        g_vel.y = 6.815f; // 268.3 u/s * SCALE
        g_onGround = false;
    }
    g_vel.y -= 20.32f * dt; // sv_gravity 800 * SCALE

    g_pos.x += g_vel.x * dt;
    g_pos.y += g_vel.y * dt;
    g_pos.z += g_vel.z * dt;
    if (g_pos.y < 1.625f) { g_pos.y = 1.625f; g_vel.y = 0.0f; g_onGround = true; }
}

static void Frame() {
    static Uint64 prev = SDL_GetPerformanceCounter();
    Uint64 now = SDL_GetPerformanceCounter();
    float dt = (float)(now - prev) / (float)SDL_GetPerformanceFrequency();
    prev = now;
    if (dt > 0.05f) dt = 0.05f;

    SDL_Event e;
    while (SDL_PollEvent(&e)) {
        if (e.type == SDL_QUIT) g_run = false;
        else if (e.type == SDL_KEYDOWN && e.key.keysym.sym == SDLK_ESCAPE) g_run = false;
        else if (e.type == SDL_MOUSEMOTION && SDL_GetRelativeMouseMode()) {
            g_yaw += e.motion.xrel * 0.14f;
            g_pitch -= e.motion.yrel * 0.14f;
            if (g_pitch > 89.0f) g_pitch = 89.0f;
            if (g_pitch < -89.0f) g_pitch = -89.0f;
        } else if (e.type == SDL_MOUSEBUTTONDOWN) {
            SDL_SetRelativeMouseMode(SDL_TRUE);
        }
    }

#ifdef __EMSCRIPTEN__
    if (!g_run) { emscripten_cancel_main_loop(); return; }
#endif

    StepMovement(dt);

    int w = 1280, h = 720;
    SDL_GL_GetDrawableSize(g_win, &w, &h);
    if (w < 1) w = 1; if (h < 1) h = 1;

    gfx::Viewport(0, 0, w, h);
    gfx::ClearColor(0.55f, 0.65f, 0.78f, 1.0f);
    gfx::Clear(gfx::ColorBuffer | gfx::DepthBuffer);

    g_cam.pos = g_pos;
    Quaternion qYaw = Quaternion::FromAxisAngle(Vector3(0, 1, 0), -g_yaw * 3.14159265f / 180.0f);
    Quaternion qPitch = Quaternion::FromAxisAngle(Vector3(1, 0, 0), g_pitch * 3.14159265f / 180.0f);
    g_cam.rot = qYaw * qPitch;
    g_cam.fov = 74.0f; // 90 deg horizontal HFOV @ 16:9
    g_cam.nearZ = 0.05f;
    g_cam.farZ = 250.0f;

    gfx::MatrixMode(gfx::Projection);
    gfx::LoadMatrixf(g_cam.ProjectionMatrix((float)w / (float)h).m);
    gfx::MatrixMode(gfx::ModelView);
    gfx::LoadMatrixf(g_cam.ViewMatrix().m);

    int cl = g_bsp.ClusterEn(g_cam.pos.x, g_cam.pos.y, g_cam.pos.z);
    std::vector<unsigned char> fila;
    if (cl >= 0) g_bsp.Fila(cl, fila);

    g_mundo.Dibujar(g_bsp, cl, fila, NULL, 0);

    SDL_GL_SwapWindow(g_win);
}

int main(int argc, char** argv) {
    SDL_SetMainReady();
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO) != 0) return 1;
    SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);
    SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);

    g_win = SDL_CreateWindow("Counter-Strike 1.5 - Whisk3D Core",
        SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, 1280, 720,
        SDL_WINDOW_OPENGL | SDL_WINDOW_RESIZABLE);
    if (!g_win) return 1;
    SDL_GLContext ctx = SDL_GL_CreateContext(g_win);
    SDL_GL_SetSwapInterval(1);

#ifdef W3D_WEBGL
    gfx::GLES2Init((void* (*)(const char*))SDL_GL_GetProcAddress);
#endif
    w3dLogReset();
    std::string map = (argc > 1) ? argv[1] : "de_dust2";
    LoadCSMap(map);

#ifdef __EMSCRIPTEN__
    emscripten_set_main_loop(Frame, 0, 1);
#else
    while (g_run) Frame();
    SDL_GL_DeleteContext(ctx);
    SDL_DestroyWindow(g_win);
    SDL_Quit();
#endif
    return 0;
}

import bpy
import math
import random
import os

def clear_scene():
    """Removes all objects from the scene and clears materials."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for mat in bpy.data.materials:
        bpy.data.materials.remove(mat)

def create_material(name, color, roughness=0.4, metallic=0.0):
    """Creates a basic material (compatible with 3.x/4.x)."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        if 'Base Color' in bsdf.inputs:
            bsdf.inputs['Base Color'].default_value = color
        else:
            bsdf.inputs[0].default_value = color
        if 'Roughness' in bsdf.inputs:
            bsdf.inputs['Roughness'].default_value = roughness
        if 'Metallic' in bsdf.inputs:
            bsdf.inputs['Metallic'].default_value = metallic
    return mat

def create_gift_box(size=2.0):
    box_mat = create_material("BoxMaterial", (0.8, 0.1, 0.1, 1.0), roughness=0.2)
    ribbon_mat = create_material("RibbonMaterial", (1.0, 0.8, 0.0, 1.0), roughness=0.1, metallic=0.5)
    half_size = size / 2
    
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    base = bpy.context.active_object
    base.name = "Box_Base"
    base.data.materials.append(box_mat)
    
    walls = []
    wall_configs = [
        ("Wall_Front", (0, -half_size, half_size), 'X', 1.57),
        ("Wall_Back",  (0, half_size, half_size),  'X', -1.57),
        ("Wall_Left",  (-half_size, 0, half_size), 'Y', -1.57),
        ("Wall_Right", (half_size, 0, half_size),  'Y', 1.57),
    ]
    
    for name, pos, axis, rot in wall_configs:
        bpy.ops.mesh.primitive_plane_add(size=size, location=pos)
        wall = bpy.context.active_object
        wall.name = name
        wall.rotation_euler[0 if axis == 'X' else 1] = rot
        wall.data.materials.append(box_mat)
        bpy.ops.object.select_all(action='DESELECT')
        wall.select_set(True)
        bpy.context.view_layer.objects.active = wall
        bpy.context.scene.cursor.location = (pos[0], pos[1], 0)
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        walls.append(wall)

    lid_thickness = 0.1
    bpy.ops.mesh.primitive_cube_add(size=size + 0.05, location=(0, 0, size + lid_thickness/2))
    lid = bpy.context.active_object
    lid.scale[2] = lid_thickness / (size + 0.05)
    lid.name = "Box_Lid"
    lid.data.materials.append(box_mat)
    
    def add_rib_strip(parent, loc, rot, scale, name):
        bpy.ops.mesh.primitive_plane_add(size=1.0, location=loc)
        strip = bpy.context.active_object
        strip.name = f"Ribbon_{name}"
        strip.rotation_euler = rot
        strip.scale = scale
        strip.data.materials.append(ribbon_mat)
        strip.parent = parent
        strip.matrix_parent_inverse = parent.matrix_world.inverted()
        return strip

    add_rib_strip(walls[0], (0, -half_size - 0.01, half_size), (1.57, 0, 0), (0.2, size, 1), "F")
    add_rib_strip(walls[1], (0, half_size + 0.01, half_size), (1.57, 0, 0), (0.2, size, 1), "B")
    add_rib_strip(walls[2], (-half_size - 0.01, 0, half_size), (0, 1.57, 0), (size, 0.2, 1), "L")
    add_rib_strip(walls[3], (half_size + 0.01, 0, half_size), (0, 1.57, 0), (size, 0.2, 1), "R")
    add_rib_strip(lid, (0, 0, size + lid_thickness + 0.01), (0,0,0), (0.2, size + 0.1, 1), "LV")
    add_rib_strip(lid, (0, 0, size + lid_thickness + 0.01), (0,0,0), (size + 0.1, 0.2, 1), "LH")

    for rot_z in [0, 90]:
        bpy.ops.mesh.primitive_torus_add(location=(0,0, size + lid_thickness + 0.1), rotation=(1.57, 0, math.radians(rot_z)), major_radius=0.2, minor_radius=0.05)
        bow = bpy.context.active_object
        bow.parent = lid
        bow.matrix_parent_inverse = lid.matrix_world.inverted()
        bow.data.materials.append(ribbon_mat)
    return walls, lid, base

def create_confetti(count=150):
    confetti_objs = []
    colors = [(1,0,0,1), (0,1,0,1), (0,0,1,1), (1,1,0,1), (1,0,1,1), (0,1,1,1)]
    for i in range(count):
        bpy.ops.mesh.primitive_plane_add(size=0.1, location=(0,0,0.1))
        c = bpy.context.active_object
        c.scale = (random.uniform(0.5, 1.5), random.uniform(0.5, 1.5), 1)
        mat = create_material(f"CMat_{i}", random.choice(colors), roughness=0.5)
        c.data.materials.append(mat)
        c.hide_viewport = c.hide_render = True
        confetti_objs.append(c)
    return confetti_objs

def animate_box(walls, lid, base, confetti, start_f=1):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0,0,0))
    container = bpy.context.active_object
    container.name = "Box_Container"
    for obj in [lid, base] + walls:
        obj.parent = container
        obj.matrix_parent_inverse = container.matrix_world.inverted()

    container.keyframe_insert(data_path="scale", frame=start_f)
    container.scale = (1.2, 1.2, 0.6)
    container.keyframe_insert(data_path="scale", frame=start_f + 6)
    container.scale = (0.8, 0.8, 1.4)
    container.keyframe_insert(data_path="scale", frame=start_f + 9)
    container.scale = (1, 1, 1)
    container.keyframe_insert(data_path="scale", frame=start_f + 12)
    
    pop_f = start_f + 10
    lid.keyframe_insert(data_path="location", frame=pop_f)
    lid.keyframe_insert(data_path="rotation_euler", frame=pop_f)
    
    lid.location[2] += 15.0
    lid.location[0] += random.choice([-6, 6])
    lid.location[1] += random.choice([-6, 6])
    lid.rotation_euler = (random.uniform(5, 12), random.uniform(5, 12), random.uniform(0, 12))
    lid.keyframe_insert(data_path="location", frame=pop_f + 16)
    lid.keyframe_insert(data_path="rotation_euler", frame=pop_f + 16)
    
    for fc in lid.animation_data.action.fcurves:
        for kp in fc.keyframe_points:
            if kp.co[0] > pop_f:
                kp.interpolation = 'BACK'

    wall_f = pop_f + 1
    for wall in walls:
        wall.keyframe_insert(data_path="rotation_euler", frame=wall_f)
        if "Front" in wall.name: wall.rotation_euler[0] = 3.14
        elif "Back" in wall.name: wall.rotation_euler[0] = -3.14
        elif "Left" in wall.name: wall.rotation_euler[1] = -3.14
        elif "Right" in wall.name: wall.rotation_euler[1] = 3.14
        wall.keyframe_insert(data_path="rotation_euler", frame=wall_f + 18)
        for fc in wall.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                if kp.co[0] > wall_f:
                    kp.interpolation = 'BOUNCE'

    for i, c in enumerate(confetti):
        c.keyframe_insert(data_path="hide_viewport", frame=pop_f - 1)
        c.keyframe_insert(data_path="hide_render", frame=pop_f - 1)
        c.hide_viewport = c.hide_render = False
        c.keyframe_insert(data_path="hide_viewport", frame=pop_f)
        c.keyframe_insert(data_path="hide_render", frame=pop_f)
        
        c.location = (0,0,1)
        c.keyframe_insert(data_path="location", frame=pop_f)
        c.keyframe_insert(data_path="scale", frame=pop_f)
        
        theta = random.uniform(0, 2 * math.pi)
        phi = math.acos(random.uniform(0, 0.8))
        dist = random.uniform(7, 12)
        
        target_x = dist * math.sin(phi) * math.cos(theta)
        target_y = dist * math.sin(phi) * math.sin(theta)
        target_z = dist * math.cos(phi)
        
        end_f = pop_f + random.randint(50, 90)
        c.location = (target_x, target_y, target_z)
        c.rotation_euler = (random.uniform(0, 30), random.uniform(0, 30), random.uniform(0, 30))
        c.keyframe_insert(data_path="location", frame=end_f)
        c.keyframe_insert(data_path="rotation_euler", frame=end_f)
        
        scale_start_f = end_f - random.randint(10, 20)
        c.keyframe_insert(data_path="scale", frame=scale_start_f)
        c.scale = (0, 0, 0)
        c.keyframe_insert(data_path="scale", frame=end_f)
        
        for fc in c.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                if kp.co[0] > pop_f:
                    kp.interpolation = 'BEZIER'
                    kp.easing = 'EASE_OUT'

def export_fbx():
    """Exports the scene as an .fbx file (Alternative for web animation)."""
    script_dir = os.path.dirname(os.path.realpath(__file__))
    file_path = os.path.join(script_dir, "gift_box_animation.fbx")
    
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.fbx(
        filepath=file_path,
        use_selection=True,
        bake_anim=True,
        bake_anim_use_all_bones=True,
        bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=True,
        ui_tab='MAIN',
        path_mode='COPY',
        embed_textures=True
    )
    print(f"Exported to FBX (Animation included!): {file_path}")

if __name__ == "__main__":
    clear_scene()
    walls, lid, base = create_gift_box()
    confetti = create_confetti(count=180)
    animate_box(walls, lid, base, confetti)
    bpy.context.scene.frame_end = 160
    
    # --- EXPORT OPTIONS ---
    # Uncomment the one you want to use:
    # export_glb() # Use this for Three.js (Fastest/Best)
    # export_fbx() # Use this if glTF exporter is broken
    
    print("Gift box shockwave animation complete!")

declare const pkg: {
    name: string;
    aptName: string;
    description: string;
    source: "rust";
    commands: ({
        name: string;
        permissionTier: "read-only";
    } | {
        name: string;
        permissionTier: "full";
    })[];
    readonly commandDir: string;
};
export default pkg;

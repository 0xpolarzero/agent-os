declare const pkg: {
    name: string;
    aptName: string;
    description: string;
    source: "rust";
    commands: {
        name: string;
        permissionTier: "read-only";
    }[];
    readonly commandDir: string;
};
export default pkg;
